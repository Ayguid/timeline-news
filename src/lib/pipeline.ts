// ============================================================================
// pipeline.ts — reusable ingestion/event-building primitives, shared by the
// cron pipeline (scripts/run-pipeline.ts) and the ON-DEMAND refresh path
// (/api/sources/[id]/refresh when a user enables a source with no fresh data).
//
// SAVE-ALL/VIEW-FILTER model (soul.md + user): we persist every clustered
// story permanently (dedup by article url). Which events a user SEES is decided
// at READ time by their current topics (lib/timeline.ts). This module is only
// about RECORDING news — fetching a source and clustering its fresh articles
// into events.
// ============================================================================
import { sql } from './db';
import { getAdapter } from './adapters';
import { clusterArticles } from './cluster';
import { scoreEvent, THRESHOLDS } from './score';
import { createHash } from 'node:crypto';

export function hashTitle(title: string): string {
  return createHash('sha256')
    .update(title.trim().toLowerCase().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 24);
}

/** Unique id: timestamp + random. Same shape as the API/seed helpers. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Cap on concurrent feed fetches. */
export const FETCH_CONCURRENCY = 8;

/** Run `fn` over `items` with at most `limit` in flight at once. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

export interface SourceRow {
  id: string;
  name: string;
  feed_url: string;
  adapter_type: string;
  owner_id: string | null;
}

/** Fetch one source's feed and batch-insert its articles (url-dedup). */
export async function fetchAndInsertSource(src: SourceRow): Promise<{ inserted: number; skipped: number; error: string | null }> {
  let result;
  try {
    const adapter = getAdapter(src.adapter_type);
    result = await adapter.fetch({ url: src.feed_url, limit: 30 });
  } catch (e) {
    return { inserted: 0, skipped: 0, error: (e as Error).message };
  }
  if (result.error) return { inserted: 0, skipped: 0, error: result.error.message };
  const articles = result.articles;
  if (articles.length === 0) return { inserted: 0, skipped: 0, error: null };

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
  return { inserted: insertedIds.length, skipped: articles.length - insertedIds.length, error: null };
}

// --- clustering /  event-building -----------------------------------------

type Scope = { userId: string | null; label: string };

interface TopicPreload {
  defaultByLang: Map<string, string[]>;
  userByUidLang: Map<string, Map<string, string[]>>;
  disabledSet: Set<string>;
}

export async function loadTopicPreload(): Promise<TopicPreload> {
  const [defaultTok, userTok, disabledRows] = await Promise.all([
    sql`SELECT lang, token FROM significant_topics`,
    sql`SELECT user_id AS uid, lang, token FROM user_topic_tokens`,
    sql`SELECT user_id AS uid, lang, token FROM user_disabled_default_topics`,
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
  return { defaultByLang, userByUidLang, disabledSet };
}

function tokensForScope(scope: Scope, candLang: string, preload: TopicPreload): string[] {
  const allDefaults = preload.defaultByLang.get(candLang) ?? [];
  if (!scope.userId) return [...new Set(allDefaults)];
  const defaults = allDefaults.filter((t) => !preload.disabledSet.has(`${scope.userId}:${candLang}:${t}`));
  const userTokens = preload.userByUidLang.get(scope.userId)?.get(candLang) ?? [];
  return [...new Set([...defaults, ...userTokens])];
}

/**
 * Cluster fresh un-attached articles in a scope and persist them as events.
 * Records EVERY clustered story (no topic gating — topics are a view filter).
 * Returns the number of events created.
 */
export async function clusterScopePersist(scope: Scope, preload: TopicPreload): Promise<number> {
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
  if (articles.length === 0) return 0;

  const candidates = clusterArticles(articles.map((a) => ({
    id: a.id,
    sourceId: a.sourceId,
    url: a.url,
    title: a.title,
    publishedAt: new Date(a.publishedAt),
    lang: a.lang ?? undefined,
  })));
  console.log(`[${scope.label}] ${articles.length} articles -> ${candidates.length} candidate event(s)`);

  let created = 0;
  for (const cand of candidates) {
    const scored = scoreEvent({
      title: cand.title,
      summary: cand.summary,
      sourceCount: cand.sourceIds.length,
      tokens: tokensForScope(scope, cand.lang, preload),
    });
    const autoApproved = scored.significanceScore >= THRESHOLDS.autoApprove;
    const status = autoApproved ? 'approved' : 'proposed';
    const eventId = newId('evt');

    await sql`
      INSERT INTO events
        (id, user_id, title, summary, event_date, date_inferred, source_count,
         distinct_sources, topic_match_score, significance_score, status, approval_source, lang)
      VALUES
        (${eventId}, ${scope.userId}, ${cand.title}, ${cand.summary},
         ${cand.eventDate}, true, ${scored.sourceCount}, ${cand.sourceIds.length},
         ${scored.topicMatchScore}, ${scored.significanceScore}, ${status}, 'auto', ${cand.lang})
      ON CONFLICT DO NOTHING
    `;

    if (cand.memberIds.length > 0) {
      const placeholders = cand.memberIds.map((_, i) => `($1,$${i + 2})`).join(', ');
      await sql.unsafe(
        `INSERT INTO event_articles (event_id, article_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
        [eventId, ...cand.memberIds],
      );
    }
    created++;
  }
  return created;
}

/** Computes which scope an owner'd source belongs to ('global' if owner NULL). */
export function scopeForOwner(ownerId: string | null): Scope {
  return ownerId ? { userId: ownerId, label: `personal:${ownerId}` } : { userId: null, label: 'global' };
}