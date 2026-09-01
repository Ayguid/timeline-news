// ============================================================================
// GET /api/timeline — chronologically-ordered approved events for the user.
//   ?days=14  — look back window (default 14)
//   ?status=approved|proposed|all  — default approved
// Ordered by event_date ASC = the product's invariant (soul.md #3, and the
// user's explicit call: chronological view).
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

  const events = await sql`
    SELECT e.id, e.title, e.summary, e.event_date AS "eventDate",
           e.significance_score AS "significanceScore",
           e.distinct_sources AS "sourceCount", e.topic_match_score AS "topicMatchScore",
           e.status, e.approval_source AS "approvalSource",
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
    JOIN event_articles ea ON ea.event_id = e.id
    JOIN raw_articles a ON a.id = ea.article_id
    JOIN sources s ON s.id = a.source_id
    WHERE e.user_id = ${session.id}
      AND e.event_date > now() - (${days} || ' days')::interval
      ${whereStatus}
    GROUP BY e.id
    ORDER BY e.event_date ASC
  `;

  return NextResponse.json({ events });
}