// ============================================================================
// /api/sources/[id] — edit & delete a source.
//   PATCH  {name?, feedUrl?, region?, active?, enabled?}
//   DELETE
// Two-tier access (migration 0005):
//   - GLOBAL source: only an ADMIN may edit or delete it.
//   - PERSONAL source: only its OWNER may edit or delete it.
// Users toggle which GLOBAL sources they want via `enabled` on PATCH — this
// writes user_sources (their filter), it does NOT modify the shared source.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let body: { name?: string; feedUrl?: string; region?: string | null; active?: boolean; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (body.feedUrl !== undefined) {
    try {
      new URL(body.feedUrl);
    } catch {
      return NextResponse.json({ error: 'feedUrl is not a valid URL' }, { status: 400 });
    }
  }

  const rows = await sql`SELECT id, owner_id AS "ownerId" FROM sources WHERE id = ${id}`;
  if (rows.length === 0) return NextResponse.json({ error: 'source not found' }, { status: 404 });
  const src = rows[0];
  const isGlobal = src.ownerId === null;

  // Access: admin may touch global; owner (only) may touch their personal.
  if (isGlobal && session.role !== 'admin') {
    return NextResponse.json({ error: 'only admins can modify global sources' }, { status: 403 });
  }
  if (!isGlobal && src.ownerId !== session.id) {
    return NextResponse.json({ error: 'not your source' }, { status: 403 });
  }

  // `enabled` on a GLOBAL source = the user's own selection (user_sources).
  if (isGlobal && typeof body.enabled === 'boolean') {
    await sql`
      INSERT INTO user_sources (user_id, source_id, enabled)
      VALUES (${session.id}, ${id}, ${body.enabled})
      ON CONFLICT (user_id, source_id) DO UPDATE SET enabled = ${body.enabled}
    `;
    return NextResponse.json({ ok: true, enabled: body.enabled });
  }

  const updated = await sql`
    UPDATE sources SET
      name        = COALESCE(${body.name ?? null}, name),
      feed_url    = COALESCE(${body.feedUrl ?? null}, feed_url),
      region      = COALESCE(${body.region ?? null}, region),
      active      = COALESCE(${body.active ?? null}, active)
    WHERE id = ${id}
    RETURNING id, name, feed_url AS "feedUrl", adapter_type AS "adapterType",
              lang, region, active, owner_id AS "ownerId"
  `;

  return NextResponse.json({ source: updated[0] });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const rows = await sql`SELECT id, owner_id AS "ownerId" FROM sources WHERE id = ${id}`;
  if (rows.length === 0) return NextResponse.json({ error: 'source not found' }, { status: 404 });
  const src = rows[0];
  const isGlobal = src.ownerId === null;

  if (isGlobal && session.role !== 'admin') {
    return NextResponse.json({ error: 'only admins can remove global sources' }, { status: 403 });
  }
  if (!isGlobal && src.ownerId !== session.id) {
    return NextResponse.json({ error: 'not your source' }, { status: 403 });
  }

  await sql`DELETE FROM sources WHERE id = ${id}`;
  // clean up anyone's selection of this source
  await sql`DELETE FROM user_sources WHERE source_id = ${id}`;
  return NextResponse.json({ ok: true });
}