// ============================================================================
// POST /api/sources/[id]/refresh — ON-DEMAND fetch for one source.
//
// Triggered when a user ENABLES a source that has no fresh stored data (or
// wants to force-refresh without waiting for the cron). Fetches that source's
// feed, batch-inserts its articles (url-dedup), then clusters + persists that
// source's scope — so the new items appear on the timeline immediately.
//
// Access:
//   - GLOBAL source (owner_id NULL): admin may refresh.
//   - PERSONAL source: its owner may refresh (and only after it's enabled).
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { fetchAndInsertSource, loadTopicPreload, clusterScopePersist, scopeForOwner } from '@/lib/pipeline';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const rows = await sql`SELECT id, name, feed_url, adapter_type, owner_id AS "ownerId", active FROM sources WHERE id = ${id}`;
  if (rows.length === 0) return NextResponse.json({ error: 'source not found' }, { status: 404 });
  const src = { id: rows[0].id, name: rows[0].name, feed_url: rows[0].feed_url, adapter_type: rows[0].adapter_type, owner_id: rows[0].ownerId };
  const isGlobal = src.owner_id === null;

  // Access: admin may refresh global; owner (and it must be active) refreshes personal.
  if (isGlobal && session.role !== 'admin') {
    return NextResponse.json({ error: 'only admins can refresh global sources' }, { status: 403 });
  }
  if (!isGlobal) {
    if (src.owner_id !== session.id) return NextResponse.json({ error: 'not your source' }, { status: 403 });
    if (!rows[0].active) return NextResponse.json({ error: 'source is not active' }, { status: 409 });
  }

  try {
    // Freshness gate: if this source already has articles from the last 72h,
    // there's no gap to fill — skip the network fetch entirely (the "only
    // fetch when needed" rule). Removing/enabling later reuses this stored data.
    const fresh = await sql`
      SELECT count(*)::int AS n FROM raw_articles
      WHERE source_id = ${id} AND published_at > now() - interval '72 hours'
    `;
    if (fresh[0].n > 0) {
      return NextResponse.json({ ok: true, inserted: 0, skipped: 0, eventsCreated: 0, alreadyFresh: true });
    }

    const { inserted, skipped, error } = await fetchAndInsertSource(src);
    if (error) return NextResponse.json({ error: `fetch failed: ${error}` }, { status: 502 });

    // Cluster + persist this source's scope so new articles become events.
    const preload = await loadTopicPreload();
    const scope = scopeForOwner(src.owner_id);
    const created = await clusterScopePersist(scope, preload);

    return NextResponse.json({ ok: true, inserted, skipped, eventsCreated: created, alreadyFresh: false });
  } catch (e) {
    const msg = (e as { message?: string }).message ?? String(e);
    return NextResponse.json({ error: `refresh failed: ${msg}` }, { status: 500 });
  }
}