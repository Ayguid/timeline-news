// ============================================================================
// /api/topics/settings — per-topic control over built-in default significance
// topics.
//   GET  ?lang=en              -> { lang, defaults: [{token, enabled}, ...] }
//   PUT  {lang, token, enabled}-> toggle ONE default on/off
//        - enabled=false -> add a row to user_disabled_default_topics
//        - enabled=true  -> remove that row (restore default)
// This is the "activate each default topic individually" feature.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { topicState } from '@/lib/topics';

export async function GET(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const lang = (new URL(req.url).searchParams.get('lang') ?? 'en').toLowerCase();
  const state = await topicState(session.id, lang);

  return NextResponse.json({
    lang,
    defaults: state.defaults, // [{token, enabled}]
    userTokens: state.userTokens,
  });
}

export async function PUT(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; token?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const lang = body.lang?.trim().toLowerCase() || 'en';
  const token = body.token?.trim().toLowerCase();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 });
  }

  if (body.enabled) {
    // restore default -> remove the disable row
    await sql`
      DELETE FROM user_disabled_default_topics
      WHERE user_id = ${session.id} AND lang = ${lang} AND token = ${token}
    `;
  } else {
    // disable a default -> add the row
    await sql`
      INSERT INTO user_disabled_default_topics (user_id, lang, token)
      VALUES (${session.id}, ${lang}, ${token})
      ON CONFLICT (user_id, lang, token) DO NOTHING
    `;
  }

  return NextResponse.json({ ok: true, lang, token, enabled: body.enabled });
}