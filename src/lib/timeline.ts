// ============================================================================
// timeline.ts — read-time timeline construction (the correct model per soul.md
// ARE: SAVE ALL the news, FILTER at view time by the user's CURRENT topics).
//
// Visibility rule (also enforced in SQL so pagination counts only VISIBLE
// events):
//   - always show if corroborated (distinct_sources >= 2)
//   - otherwise show if title/summary matches ANY active token (ILIKE ANY)
//
// Pagination: keyset cursor on (event_date, id) ASC. Oldest first (invariant,
// soul.md #3); scrolling appends newer. The active tokens are sent to the DB
// as ONE text[] param so LIMIT counts only events the user will actually see.
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
    WITH visible AS (
      SELECT DISTINCT e.id
      FROM events e
      JOIN event_articles ea ON ea.event_id = e.id
      JOIN raw_articles a ON a.id = ea.article_id
      JOIN sources s ON s.id = a.source_id
      JOIN user_sources us ON us.source_id = s.id AND us.user_id = ${session.id}
      WHERE e.user_id IS NULL AND us.enabled = true
      UNION
      SELECT id FROM events WHERE user_id = ${session.id}
    )
    SELECT e.id, e.title, e.summary, e.event_date AS "eventDate",
           e.significance_score AS "significanceScore",
           e.distinct_sources AS "sourceCount",
           e.status, e.user_id AS "userId", e.lang AS lang,
           count(a.id)::int AS "articleCount",
           COALESCE(
             json_agg(json_build_object(
               'articleUrl', a.url,
               'title', a.title,
               'sourceName', s.name,
               'publishedAt', a.published_at
             ) ORDER BY a.published_at ASC) FILTER (WHERE a.id IS NOT NULL),
             '[]'
           ) AS articles
    FROM events e
    JOIN visible v ON v.id = e.id
    LEFT JOIN event_articles ea ON ea.event_id = e.id
    LEFT JOIN raw_articles a ON a.id = ea.article_id
    LEFT JOIN sources s ON s.id = a.source_id
    WHERE e.status != 'rejected'
      AND e.event_date > now() - (${days} || ' days')::interval
      AND (e.distinct_sources >= 2
           OR e.title ILIKE ANY(${patterns})
           OR e.summary ILIKE ANY(${patterns}))
      ${cursor ? sql`AND (e.event_date > ${new Date(cursor.date)} OR (e.event_date = ${new Date(cursor.date)} AND e.id > ${cursor.id}))` : sql``}
    GROUP BY e.id
    ORDER BY e.event_date ASC, e.id ASC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // topicMatches is a display nicety only — visibility is already enforced in SQL.
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
    topicMatches: 0,
    articles: Array.isArray(r.articles) ? r.articles : [],
  }));

  const last = events[events.length - 1];
  const nextCursor = hasMore && last ? { date: new Date(last.eventDate).toISOString(), id: last.id } : null;

  return { events, activeTokenCount: tokens.length, nextCursor, hasMore };
}