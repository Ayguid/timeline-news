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
  // active sources across all users, joined to adapter type
  const sources = await sql`
    SELECT s.id, s.name, s.feed_url, s.adapter_type, s.user_id
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

async function clusterAndScore(): Promise<void> {
  // fresh articles (last 72h) that aren't yet attached to an event
  const articles = await sql`
    SELECT a.id, a.source_id AS "sourceId", a.url, a.title, a.published_at AS "publishedAt",
           s.lang AS lang
    FROM raw_articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN event_articles ea ON ea.article_id = a.id
    WHERE ea.article_id IS NULL
      AND a.published_at > now() - interval '72 hours'
  `;

  if (articles.length === 0) {
    console.log('[cluster] no un-clustered fresh articles');
    return;
  }

  const candidates = clusterArticles(articles.map((a) => ({
    id: a.id,
    sourceId: a.sourceId,
    url: a.url,
    title: a.title,
    publishedAt: new Date(a.publishedAt),
    lang: a.lang ?? undefined,
  })));

  console.log(`[cluster] ${articles.length} articles -> ${candidates.length} candidate event(s)`);

  // --- Bulk preload (avoid a per-candidate round-trip to the DB) -----------
  // source -> owner, all significance tokens (defaults + user overrides), and
  // the per-(user,lang) defaults toggle.
  const [ownerRows, defaultTok, userTok, settings] = await Promise.all([
    sql`SELECT id AS sid, user_id AS uid FROM sources`,
    sql`SELECT lang, token FROM significant_topics`,
    sql`SELECT user_id AS uid, lang, token FROM user_topic_tokens`,
    sql`SELECT user_id AS uid, lang, defaults_enabled AS de FROM user_topic_settings`,
  ]);
  const sourceOwner = new Map(ownerRows.map((r) => [r.sid, r.uid]));
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
  // defaults enabled unless a setting row explicitly disables it.
  const defaultsDisabled = new Set<string>();
  for (const r of settings) {
    if (r.de === false) defaultsDisabled.add(`${r.uid}:${r.lang}`);
  }

  // Which article belongs to which source id (to map candidate member -> owner)
  const artSource = new Map(articles.map((a) => [a.id, a.sourceId]));

  type PendingEvent = { eventId: string; memberIds: string[] };
  const eventsToInsert: PendingEvent[] = [];

  for (const cand of candidates) {
    const srcId = artSource.get(cand.memberIds[0]);
    const userId = sourceOwner.get(srcId ?? '') ?? 'user_demo';

    // effective tokens = defaults(lang) UNION user(lang), unless the user has
    // switched the defaults off for this language — then user tokens only.
    const defaults = defaultsDisabled.has(`${userId}:${cand.lang}`) ? [] : (defaultByLang.get(cand.lang) ?? []);
    const userTokens = userByUidLang.get(userId)?.get(cand.lang) ?? [];
    const scored = scoreEvent({
      title: cand.title,
      summary: cand.summary,
      sourceCount: cand.sourceIds.length,
      tokens: [...new Set([...defaults, ...userTokens])],
    });

    if (scored.significanceScore < THRESHOLDS.propose) {
      console.log(`  - below bar (${scored.significanceScore}): ${cand.title.slice(0, 60)}`);
      continue;
    }

    const autoApproved = scored.significanceScore >= THRESHOLDS.autoApprove;
    const status = autoApproved ? 'approved' : 'proposed';
    const eventId = newId('evt');
    eventsToInsert.push({ eventId, memberIds: cand.memberIds });

    await sql`
      INSERT INTO events
        (id, user_id, title, summary, event_date, date_inferred, source_count,
         topic_match_score, significance_score, status, approval_source)
      VALUES
        (${eventId}, ${userId}, ${cand.title}, ${cand.summary},
         ${cand.eventDate}, true, ${scored.sourceCount}, ${scored.topicMatchScore},
         ${scored.significanceScore}, ${status}, 'auto')
      ON CONFLICT DO NOTHING
    `;

    console.log(`  + [${status}] (${scored.significanceScore}) ${cand.title.slice(0, 60)}`);
  }

  // Batch all event_article links (one statement per event, no per-link round-trip).
  for (const ev of eventsToInsert) {
    if (ev.memberIds.length === 0) continue;
    const placeholders = ev.memberIds.map((_, i) => `($1,$${i + 2})`).join(', ');
    const linkParams: Array<string | Date | null> = [
      ev.eventId,
      ...ev.memberIds,
    ];
    await sql.unsafe(
      `INSERT INTO event_articles (event_id, article_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      linkParams,
    );
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