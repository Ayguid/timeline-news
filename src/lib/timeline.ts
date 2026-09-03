// ============================================================================
// timeline.ts — read-time timeline construction (SAVE ALL, FILTER at view).
//
// Visibility is computed from the user's CURRENTLY-ENABLED sources + topics:
//   - corroboration = distinct ENABLED sources covering the event
//   - always show if corroborated by >=2 enabled sources
//   - else show if covered by >=1 enabled source AND matches an active token
//   - personal events (user's own sources) always show
// Articles / framing NEVER include a source the user disabled.
//
// Pagination: keyset cursor (event_date, id) ASC. Oldest first (soul.md #3).
// ============================================================================
import { sql } from './db';
import { currentUser } from './session';

export interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  eventDate: Date;
  significanceScore: number;
  sourceCount: number;
  status: string;
  lang: string;
  userId: string | null;
  articleCount: number;
  topicMatches: number;
  articles: { articleUrl: string; title: string; sourceName: string; publishedAt: Date }[];
}

export type TimelineCursor = { date: string; id: string };

export interface TimelineResult {
  events: TimelineEvent[];
  activeTokenCount: number;
  nextCursor: TimelineCursor | null;
  hasMore: boolean;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function activeTokens(userId: string): Promise<string[]> {
  const [defaults, overrides, disabled] = await Promise.all([
    sql`SELECT lang, token FROM significant_topics`,
    sql`SELECT lang, token FROM user_topic_tokens WHERE user_id = ${userId}`,
    sql`SELECT lang, token FROM user_disabled_default_topics WHERE user_id = ${userId}`,
  ]);
  const off = new Set(disabled.map((r) => `${r.lang}:${r.token}`));
  const out = new Set<string>();
  for (const r of defaults) if (!off.has(`${r.lang}:${r.token}`)) out.add(r.token);
  for (const r of overrides) if (!off.has(`${r.lang}:${r.token}`)) out.add(r.token);
  return [...out];
}

export async function getTimelineEvents(opts: {
  days?: number;
  limit?: number;
  cursor?: TimelineCursor | null;
} = {}): Promise<TimelineResult> {
  const session = await currentUser();
  if (!session?.id) return { events: [], activeTokenCount: 0, nextCursor: null, hasMore: false };

  const days = Math.min(Number(opts.days ?? 14) || 14, 90);
  const limit = Math.min(Math.max(Number(opts.limit ?? 40) || 40, 1), 200);
  const tokens = await activeTokens(session.id);
  const patterns = tokens.map((t) => `%${escapeLike(t)}%`);
  const cursor = opts.cursor && opts.cursor.date && opts.cursor.id ? opts.cursor : null;

  const rows = await sql`
    WITH vis_ea AS (
      -- event_articles restricted to sources this user can actually see:
      --   global sources they currently have enabled + their personal sources.
      SELECT ea.event_id, ea.article_id, s.id AS sid
      FROM event_articles ea
      JOIN raw_articles a ON a.id = ea.article_id
      JOIN sources s ON s.id = a.source_id
      WHERE (s.owner_id IS NULL AND EXISTS (
              SELECT 1 FROM user_sources us
              WHERE us.source_id = s.id AND us.user_id = ${session.id} AND us.enabled = true))
         OR (s.owner_id = ${session.id})
    ),
    vis_events AS (
      SELECT ve.event_id,
             count(DISTINCT ve.sid)::int AS enabled_sources,
             count(ve.article_id)::int AS article_count,
             json_agg(json_build_object(
               'articleUrl', a.url,
               'title', a.title,
               'sourceName', s.name,
               'publishedAt', a.published_at
             ) ORDER BY a.published_at ASC) AS articles
      FROM vis_ea ve
      JOIN raw_articles a ON a.id = ve.article_id
      JOIN sources s ON s.id = ve.sid
      GROUP BY ve.event_id
    )
    SELECT e.id, e.title, e.summary, e.event_date AS "eventDate",
           e.significance_score AS "significanceScore",
           ve.enabled_sources AS "sourceCount",
           e.status, e.user_id AS "userId", e.lang AS lang,
           ve.article_count AS "articleCount",
           ve.articles AS articles,
           (e.title ILIKE ANY(${patterns}) OR e.summary ILIKE ANY(${patterns})) AS "matchesTopic"
    FROM events e
    JOIN vis_events ve ON ve.event_id = e.id
    WHERE e.status != 'rejected'
      AND e.event_date > now() - (${days} || ' days')::interval
      -- visible: corroborated by >=2 enabled sources, OR (covered AND topic-matched)
      AND (ve.enabled_sources >= 2 OR (ve.enabled_sources >= 1 AND (e.title ILIKE ANY(${patterns}) OR e.summary ILIKE ANY(${patterns}))))
      ${cursor ? sql`AND (e.event_date > ${new Date(cursor.date)} OR (e.event_date = ${new Date(cursor.date)} AND e.id > ${cursor.id}))` : sql``}
    ORDER BY e.event_date ASC, e.id ASC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const events: TimelineEvent[] = page.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    eventDate: r.eventDate,
    significanceScore: r.significanceScore,
    sourceCount: r.sourceCount,
    status: r.status,
    lang: r.lang,
    userId: r.userId,
    articleCount: r.articleCount,
    topicMatches: r.matchesTopic ? 1 : 0,
    articles: Array.isArray(r.articles) ? r.articles : [],
  }));

  const last = events[events.length - 1];
  const nextCursor = hasMore && last ? { date: new Date(last.eventDate).toISOString(), id: last.id } : null;

  return { events, activeTokenCount: tokens.length, nextCursor, hasMore };
}