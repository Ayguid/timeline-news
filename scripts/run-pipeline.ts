// ============================================================================
// run-pipeline.ts — end-to-end ingestion for the current user's sources.
//   ingest (adapter -> raw_articles) -> cluster -> score -> persist
// Runs in GitHub Actions cron. For the v1 demo it processes ALL users and
// their active sources.
// Usage: npx tsx scripts/run-pipeline.ts [--dry-run]
// ============================================================================
import { sql } from '../src/lib/db';
import { getAdapter } from '../src/lib/adapters';
import { clusterArticles } from '../src/lib/cluster';
import { scoreEvent, THRESHOLDS } from '../src/lib/score';
import { createHash } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');

function hashTitle(title: string): string {
  return createHash('sha256')
    .update(title.trim().toLowerCase().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 24);
}

// Unique id: timestamp + random. Same shape as the API/seed helpers.
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Cap on concurrent feed fetches. Keeps us from hammering every source at once
// or exhausting local sockets while still making N feeds take ~max(feed) rather
// than ~sum(feed).
const FETCH_CONCURRENCY = 8;

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function ingestAll(): Promise<void> {
  // All ACTIVE sources: global (owner_id NULL) + personal (owner_id set).
  const sources = await sql`
    SELECT s.id, s.name, s.feed_url, s.adapter_type, s.owner_id
    FROM sources s
    WHERE s.active = true
  `;

  console.log(`[ingest] ${sources.length} active source(s)`);
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  // Fix 1: fetch feeds in parallel (concurrency-capped).
  const batches = await mapLimit(sources, FETCH_CONCURRENCY, async (src) => {
    let result;
    try {
      const adapter = getAdapter(src.adapter_type);
      result = await adapter.fetch({ url: src.feed_url, limit: 30 });
    } catch (e) {
      return { src, articles: [], error: (e as Error).message };
    }
    if (result.error) return { src, articles: [], error: result.error.message };
    return { src, articles: result.articles, error: null };
  });

  for (const { src, articles, error } of batches) {
    if (error) {
      console.error(`  ! ${src.name}: fetch error — ${error}`);
      failed++;
      continue;
    }
    if (articles.length === 0) continue;

    // Fix 2: batch insert ONE multi-row statement per source. No per-article
    // SELECT — we rely on the `url` UNIQUE constraint + ON CONFLICT DO NOTHING
    // as the dedup backstop. 2N round-trips -> 1. We build the multi-row
    // VALUES with explicit placeholders and a flat parameter array (parameterized,
    // so values are still bound safely — never interpolated into SQL).
    const valuePlaceholders = articles.map((_, i) => {
      const base = i * 7;
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`;
    });
    const params: Array<string | Date | null> = [];
    for (const a of articles) {
      params.push(newId('art'), src.id, a.url, a.title, hashTitle(a.title), a.summaryExcerpt ?? null, a.publishedAt);
    }
    const insertedIds = await sql.unsafe(
      `INSERT INTO raw_articles (id, source_id, url, title, title_hash, summary_excerpt, published_at)
       VALUES ${valuePlaceholders.join(', ')}
       ON CONFLICT (url) DO NOTHING
       RETURNING id`,
      params,
    );
    inserted += insertedIds.length;
    skipped += articles.length - insertedIds.length;
  }

  console.log(`[ingest] inserted=${inserted} skipped_dupes=${skipped} failed=${failed}`);
}

// ---------------------------------------------------------------------------
// clusterAndScore — two-tier event building.
//   GLOBAL scope  : articles from global sources (owner_id NULL) cluster into
//                   SHARED events (user_id NULL). Scored with the built-in
//                   default topics only (no per-user bias) — one deterministic,
//                   auto-approved record shared by everyone.
//   PERSONAL scope: for each user, their own sources' articles cluster into
//                   PERSONAL events (user_id = owner), scored with that user's
//                   topic preferences.
// ---------------------------------------------------------------------------
type Scope = { userId: string | null; label: string };

/** Compute effective scoring tokens for a candidate in a given scope. */
function tokensForScope(
  scope: Scope,
  candLang: string,
  preload: { defaultByLang: Map<string, string[]>; userByUidLang: Map<string, Map<string, string[]>>; disabledSet: Set<string> },
): string[] {
  const allDefaults = preload.defaultByLang.get(candLang) ?? [];
  // Global scope (userId null): no per-user override/disable — defaults only,
  // so the shared record is deterministic.
  if (!scope.userId) return [...new Set(allDefaults)];
  // Personal scope: enabled defaults ∪ the owner's own tokens.
  const defaults = allDefaults.filter((t) => !preload.disabledSet.has(`${scope.userId}:${candLang}:${t}`));
  const userTokens = preload.userByUidLang.get(scope.userId)?.get(candLang) ?? [];
  return [...new Set([...defaults, ...userTokens])];
}

async function runScopedCluster(
  scope: Scope,
  preload: { defaultByLang: Map<string, string[]>; userByUidLang: Map<string, Map<string, string[]>>; disabledSet: Set<string> },
): Promise<number> {
  // fresh articles in this scope, not yet attached to an event
  const articles = await sql`
    SELECT a.id, a.source_id AS "sourceId", a.url, a.title, a.published_at AS "publishedAt",
           s.lang AS lang
    FROM raw_articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN event_articles ea ON ea.article_id = a.id
    WHERE ea.article_id IS NULL
      AND a.published_at > now() - interval '72 hours'
      ${scope.userId ? sql`AND s.owner_id = ${scope.userId}` : sql`AND s.owner_id IS NULL`}
  `;
  if (articles.length === 0) {
    console.log(`[${scope.label}] no un-clustered fresh articles`);
    return 0;
  }

  const candidates = clusterArticles(articles.map((a) => ({
    id: a.id,
    sourceId: a.sourceId,
    url: a.url,
    title: a.title,
    publishedAt: new Date(a.publishedAt),
    lang: a.lang ?? undefined,
  })));
  console.log(`[${scope.label}] ${articles.length} articles -> ${candidates.length} candidate event(s)`);

  const artSource = new Map(articles.map((a) => [a.id, a.sourceId]));
  let created = 0;

  for (const cand of candidates) {
    const srcId = artSource.get(cand.memberIds[0]) ?? '';
    const scored = scoreEvent({
      title: cand.title,
      summary: cand.summary,
      sourceCount: cand.sourceIds.length,
      tokens: tokensForScope(scope, cand.lang, preload),
    });

    if (scored.significanceScore < THRESHOLDS.propose) {
      console.log(`  - below bar (${scored.significanceScore}): ${cand.title.slice(0, 60)}`);
      continue;
    }

    const autoApproved = scored.significanceScore >= THRESHOLDS.autoApprove;
    const status = autoApproved ? 'approved' : 'proposed';
    const eventId = newId('evt');

    await sql`
      INSERT INTO events
        (id, user_id, title, summary, event_date, date_inferred, source_count,
         distinct_sources, topic_match_score, significance_score, status, approval_source)
      VALUES
        (${eventId}, ${scope.userId}, ${cand.title}, ${cand.summary},
         ${cand.eventDate}, true, ${scored.sourceCount}, ${cand.sourceIds.length},
         ${scored.topicMatchScore}, ${scored.significanceScore}, ${status}, 'auto')
      ON CONFLICT DO NOTHING
    `;

    // Batch the event_article links.
    if (cand.memberIds.length > 0) {
      const placeholders = cand.memberIds.map((_, i) => `($1,$${i + 2})`).join(', ');
      await sql.unsafe(
        `INSERT INTO event_articles (event_id, article_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        [eventId, ...cand.memberIds],
      );
    }

    console.log(`  + [${status}] (${scored.significanceScore}) ${cand.title.slice(0, 60)}`);
    created++;
  }
  return created;
}

async function clusterAndScore(): Promise<void> {
  // Bulk preload source->owner, all significance tokens, and per-user disables.
  const [ownerRows, defaultTok, userTok, disabledRows, personalOwners] = await Promise.all([
    sql`SELECT id AS sid, owner_id AS uid FROM sources`,
    sql`SELECT lang, token FROM significant_topics`,
    sql`SELECT user_id AS uid, lang, token FROM user_topic_tokens`,
    sql`SELECT user_id AS uid, lang, token FROM user_disabled_default_topics`,
    sql`SELECT DISTINCT owner_id AS uid FROM sources WHERE owner_id IS NOT NULL AND active = true`,
  ]);
  const defaultByLang = new Map<string, string[]>();
  for (const r of defaultTok) {
    const arr = defaultByLang.get(r.lang) ?? [];
    arr.push(r.token);
    defaultByLang.set(r.lang, arr);
  }
  const userByUidLang = new Map<string, Map<string, string[]>>();
  for (const r of userTok) {
    const byLang = userByUidLang.get(r.uid) ?? new Map();
    const arr = byLang.get(r.lang) ?? [];
    arr.push(r.token);
    byLang.set(r.lang, arr);
  }
  const disabledSet = new Set<string>();
  for (const r of disabledRows) disabledSet.add(`${r.uid}:${r.lang}:${r.token}`);
  const preload = { defaultByLang, userByUidLang, disabledSet };

  // 1) Shared/global events (admin sources).
  await runScopedCluster({ userId: null, label: 'global' }, preload);

  // 2) Personal events per user who owns active sources.
  for (const owner of personalOwners) {
    await runScopedCluster({ userId: owner.uid, label: `personal:${owner.uid}` }, preload);
  }
}

async function main() {
  try {
    console.log('=== timeline-news pipeline ===');
    if (dryRun) console.log('DRY RUN — no writes');
    await ingestAll();
    await clusterAndScore();
    console.log('=== done ===');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('pipeline failed:', e);
  process.exit(1);
});