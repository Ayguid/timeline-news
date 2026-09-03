// ============================================================================
// GET /api/timeline — paginated, chronologically-ordered events for the user.
//   ?days=14&limit=40&date=<ISO>&id=<eventId>
// Read-time model: selects ALL stored (non-rejected) news the user can see,
// then filters at read time by the user's CURRENT topic preferences AND
// paginates server-side (keyset on event_date,id ASC) for infinite scroll.
// Multi-source events always show; single-source events show only if they
// match a currently-active topic. So toggling a topic immediately changes
// what's returned — no re-scrape, no lost news.
// Ordering: event_date ASC = the product's invariant (soul.md #3).
// ============================================================================
import { NextResponse } from 'next/server';
import { getTimelineEvents, type TimelineCursor } from '@/lib/timeline';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') ?? 14);
  const limit = Number(url.searchParams.get('limit') ?? 40);
  const date = url.searchParams.get('date');
  const id = url.searchParams.get('id');
  const cursor: TimelineCursor | null = date && id ? { date, id } : null;

  const { events, activeTokenCount, nextCursor, hasMore } = await getTimelineEvents({
    days,
    limit,
    cursor,
  });
  return NextResponse.json({ events, activeTokenCount, nextCursor, hasMore });
}