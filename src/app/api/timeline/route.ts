// ============================================================================
// GET /api/timeline — chronologically-ordered events for the user.
//   ?days=14
// Read-time model: selects ALL stored (non-rejected) news the user can see,
// then filters at read time by the user's CURRENT topic preferences (see
// src/lib/timeline.ts). Multi-source events always show; single-source events
// show only if they match a currently-active topic. So toggling a topic
// immediately changes what's returned — no re-scrape, no lost news.
// Ordered by event_date ASC = the product's invariant (soul.md #3).
// ============================================================================
import { NextResponse } from 'next/server';
import { getTimelineEvents } from '@/lib/timeline';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Number(url.searchParams.get('days') ?? 14);
  const { events, activeTokenCount } = await getTimelineEvents({ days });
  return NextResponse.json({ events, activeTokenCount });
}