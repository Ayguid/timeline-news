// ============================================================================
// /api/sources — two-tier source management (migration 0005).
//   GET                         — GLOBAL sources (admin-curated, with the
//                                  user's enabled flag in user_sources) PLUS
//                                  the user's PERSONAL sources.
//   POST {feedUrl,...}          — adds a source.
//                                  Admin: creates a GLOBAL source (owner_id NULL).
//                                  User:  creates a PERSONAL source (owner_id = me),
//                                         capped at PERSONAL_SOURCE_CAP.
//   PATCH/DELETE /[id]          — owner edits/removes their personal source;
//                                  admin edits/removes any global source.
// The user's SELECTION of global sources lives in user_sources; POST
// /api/sources/[id]/enable toggles it.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';

/** Max PERSONAL sources a single user may add (keeps ingestion bounded). */
export const PERSONAL_SOURCE_CAP = 5;

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize: reject bad URL, default adapter to rss. */
function validate(body: { name?: string; feedUrl?: string; adapterType?: string }) {
  const name = body.name?.trim();
  const feedUrl = body.feedUrl?.trim();
  if (!name || !feedUrl) return { error: 'name and feedUrl required' };
  let adapterType: string;
  if (body.adapterType === 'html') adapterType = 'html';
  else if (body.adapterType === 'rss') adapterType = 'rss';
  else adapterType = 'rss';
  try {
    new URL(feedUrl);
  } catch {
    return { error: 'feedUrl is not a valid URL' };
  }
  return { name, feedUrl, adapterType };
}

function newSourceId() {
  return newId('src');
}

export async function GET() {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Global sources + whether the user has enabled each one.
  const global = await sql`
    SELECT s.id, s.name, s.feed_url AS "feedUrl", s.adapter_type AS "adapterType",
           s.lang, s.region, s.active,
           COALESCE(us.enabled, false) AS "enabled"
    FROM sources s
    LEFT JOIN user_sources us ON us.source_id = s.id AND us.user_id = ${session.id}
    WHERE s.owner_id IS NULL
    ORDER BY s.name
  `;

  // The user's personal sources (owner_id = me).
  const personal = await sql`
    SELECT id, name, feed_url AS "feedUrl", adapter_type AS "adapterType",
           lang, region, active, created_at AS "createdAt"
    FROM sources
    WHERE owner_id = ${session.id}
    ORDER BY created_at ASC
  `;

  return NextResponse.json({
    global,
    personal,
    role: session.role,
    personalCap: PERSONAL_SOURCE_CAP,
    personalCount: personal.length,
  });
}

export async function POST(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const v = validate(body);
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const isAdmin = session.role === 'admin';
  // Admin creates global sources; everyone else gets a capped personal source.
  const ownerId = isAdmin ? null : session.id;

  if (!isAdmin) {
    const cnt = await sql`SELECT count(*)::int AS n FROM sources WHERE owner_id = ${session.id}`;
    if (cnt[0].n >= PERSONAL_SOURCE_CAP) {
      return NextResponse.json(
        { error: `personal source limit reached (${PERSONAL_SOURCE_CAP})` },
        { status: 409 },
      );
    }
  }

  try {
    const id = newSourceId();
    await sql`
      INSERT INTO sources (id, name, feed_url, adapter_type, lang, region, active, owner_id)
      VALUES (${id}, ${v.name}, ${v.feedUrl}, ${v.adapterType}, 'en',
              ${body.region ?? null}, true, ${ownerId})
    `;
    return NextResponse.json({ id, name: v.name, feedUrl: v.feedUrl, adapterType: v.adapterType, ownerId }, { status: 201 });
  } catch (e) {
    const msg = (e as { message?: string }).message ?? '';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'this feed is already in the source list' }, { status: 409 });
    }
    throw e;
  }
}