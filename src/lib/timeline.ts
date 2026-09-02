// ============================================================================
// timeline.ts — read-time timeline construction (the correct model per soul.md
// and the user: SAVE ALL the news, FILTER at view time by the user's CURRENT
// topics). Nothing here re-scrapes or re-clusters; it selects from the
// permanent events table and filters by the user's present topic preferences.
//
// Visibility rule per event:
//   - Always show if corroborated (distinct_sources >= 2) — multi-source
//     coverage is inherently significant (soul.md principle #2).
//   - Otherwise show if the event's title/summary matches ANY of the user's
//     CURRENT effective tokens for that event's language. Because tokens are
//     read live here, enabling/disabling a topic changes the timeline
//     immediately, with no re-scrape and no news ever lost.
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

export interface TimelineResult {
  events: TimelineEvent[];
  // which tokens were active, so the caller can label the filter if it wants
  activeTokenCount: number;
}

/** Live `contains` topic match — token appears in title or summary. */
function matchesAnyToken(title: string, summary: string, tokens: Set<string>): boolean {
  const text = `${title} ${summary}`.toLowerCase();
  for (const t of tokens) if (text.includes(t.toLowerCase())) return true;
  return false;
}

export async function getTimelineEvents(opts: { days?: number } = {}): Promise<TimelineResult> {
  const session = await currentUser();
  if (!session?.id) return { events: [], activeTokenCount: 0 };

  const days = Math.min(Number(opts.days ?? 14) || 14, 90);

  // Live effective tokens per language (independent of any pipeline snapshot).
  const [defaults, overrides, disabled] = await Promise.all([
    sql`SELECT lang, token FROM significant_topics`,
    sql`SELECT lang, token FROM user_topic_tokens WHERE user_id = ${session.id}`,
    sql`SELECT lang, token FROM user_disabled_default_topics WHERE user_id = ${session.id}`,
  ]);
  const disabledSet = new Set(disabled.map((r) => `${r.lang}:${r.token}`));
  const tokenByLang = new Map<string, Set<string>>();
  const addToken = (lang: string, token: string) => {
    if (disabledSet.has(`${lang}:${token}`)) return;
    if (!tokenByLang.has(lang)) tokenByLang.set(lang, new Set());
    tokenByLang.get(lang)!.add(token);
  };
  for (const r of defaults) addToken(r.lang, r.token);
  for (const r of overrides) addToken(r.lang, r.token);
  const activeTokenCount = [...tokenByLang.values()].reduce((a, s) => a + s.size, 0);

  // Show ALL stored news that is not rejected. The significance/topic bar is
  // applied HERE at read time, not at storage time — so toggling a topic
  // immediately changes what the user sees without re-scraping.
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
    GROUP BY e.id
    ORDER BY e.event_date ASC
  `;

  const events: TimelineEvent[] = [];
  for (const row of rows) {
    const langTokens = tokenByLang.get(row.lang) ?? new Set<string>();
    const topicMatches = matchesAnyToken(row.title, row.summary, langTokens) ? 1 : 0;

    // Multi-source (`distinct_sources >= 2`) events are always shown.
    // Single-source ones are shown only if they match a CURRENT topic.
    if (row.sourceCount < 2 && topicMatches === 0) continue;

    events.push({
      id: row.id,
      title: row.title,
      summary: row.summary,
      eventDate: row.eventDate,
      significanceScore: row.significanceScore,
      sourceCount: row.sourceCount,
      status: row.status,
      lang: row.lang,
      userId: row.userId,
      articleCount: row.articleCount,
      topicMatches,
      articles: Array.isArray(row.articles) ? row.articles : [],
    });
  }

  return { events, activeTokenCount };
}