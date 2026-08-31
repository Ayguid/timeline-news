// ============================================================================
// /api/sources/[id] — edit & delete one of the user's sources.
//   PATCH  {name?, feedUrl?, region?, active?}  — partial update
//   DELETE                                       — remove the source (and its
//                                                  articles via FK cascade)
// Ownership enforced: a user can only touch their own sources.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  let body: { name?: string; feedUrl?: string; region?: string | null; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // validate feedUrl if provided
  if (body.feedUrl !== undefined) {
    try {
      new URL(body.feedUrl);
    } catch {
      return NextResponse.json({ error: 'feedUrl is not a valid URL' }, { status: 400 });
    }
  }

  const existing = await sql`
    SELECT id FROM sources WHERE id = ${id} AND user_id = ${session.id}
  `;
  if (existing.length === 0) {
    return NextResponse.json({ error: 'source not found' }, { status: 404 });
  }

  const updated = await sql`
    UPDATE sources SET
      name        = COALESCE(${body.name ?? null}, name),
      feed_url    = COALESCE(${body.feedUrl ?? null}, feed_url),
      region      = COALESCE(${body.region ?? null}, region),
      active      = COALESCE(${body.active ?? null}, active)
    WHERE id = ${id} AND user_id = ${session.id}
    RETURNING id, name, feed_url AS "feedUrl", adapter_type AS "adapterType",
              lang, region, active
  `;

  return NextResponse.json({ source: updated[0] });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const res = await sql`
    DELETE FROM sources WHERE id = ${id} AND user_id = ${session.id}
    RETURNING id
  `;

  if (res.length === 0) {
    return NextResponse.json({ error: 'source not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}