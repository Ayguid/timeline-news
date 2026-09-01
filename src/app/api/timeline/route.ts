// ============================================================================
// GET /api/timeline — chronologically-ordered events for the user.
//   ?days=14    — look back window (default 14)
//   ?status=all — show approved (default). Supported: approved|proposed|all
//
// Two-tier view (migration 0005):
//   - GLOBAL events (user_id NULL): every approved global event whose covering
//     sources the user has ENABLED in user_sources. Shared record, filtered by
//     the user's source preferences.
//   - PERSONAL events (user_id = me): built from the user's own sources, scored
//     with the user's topics.
// Both `approved` and `proposed` events have passed the significance bar; the
// API defaults to `approved` for a clean view, but `proposed` are legitimate
// single-source / pending-confirm world news the user will often want.
// Ordered by event_date ASC = the product's invariant (soul.md #3).
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';

export async function GET(req: Request) {
  const session = await currentUser();
  if (!session?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get('days') ?? 14) || 14, 90);
  const status = url.searchParams.get('status') ?? 'approved';

  const whereStatus =
    status === 'all' ? sql`AND e.status != 'rejected'` : sql`AND e.status = ${status}`;

  // A global event is shown to the user iff they have enabled at least one of
  // the sources covering it. Personal events are always shown to their owner.
  // EXPLICITLY: global events require e.user_id IS NULL AND an enabled source.
  // This is the join that personalizes the shared record without copying it.
  const events = await sql`
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
           e.distinct_sources AS "sourceCount", e.topic_match_score AS "topicMatchScore",
           e.status, e.approval_source AS "approvalSource",
           e.user_id AS "userId",
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
    WHERE e.event_date > now() - (${days} || ' days')::interval
      ${whereStatus}
    GROUP BY e.id
    ORDER BY e.event_date ASC
  `;

  return NextResponse.json({ events });
}