// ============================================================================
// /api/sources — user-curated feed management (the "user picks their own
// sources" requirement). GET lists the user's sources; POST adds one.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sources = await sql`
    SELECT id, name, feed_url AS "feedUrl", adapter_type AS "adapterType",
           lang, region, active, created_at AS "createdAt"
    FROM sources WHERE user_id = ${session.id} ORDER BY created_at ASC
  `;
  return NextResponse.json({ sources });
}

export async function POST(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { name?: string; feedUrl?: string; region?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const name = body.name?.trim();
  const feedUrl = body.feedUrl?.trim();
  if (!name || !feedUrl) {
    return NextResponse.json({ error: 'name and feedUrl required' }, { status: 400 });
  }
  // sanity: must look like a URL
  try {
    new URL(feedUrl);
  } catch {
    return NextResponse.json({ error: 'feedUrl is not a valid URL' }, { status: 400 });
  }

  try {
    const id = newId('src');
    await sql`
      INSERT INTO sources (id, user_id, name, feed_url, adapter_type, lang, region, active)
      VALUES (${id}, ${session.id}, ${name}, ${feedUrl}, 'rss', 'en',
              ${body.region ?? null}, true)
    `;
    return NextResponse.json({ id, name, feedUrl }, { status: 201 });
  } catch (e) {
    // unique (user_id, feed_url) violation
    const msg = (e as { message?: string }).message ?? '';
    if (msg.includes('duplicate')) {
      return NextResponse.json({ error: 'you already subscribed to this feed' }, { status: 409 });
    }
    throw e;
  }
}