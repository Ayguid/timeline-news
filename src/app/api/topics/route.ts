// ============================================================================
// /api/topics — user-editable significance tokens.
//   GET   ?lang=en          — default + user tokens, plus defaults_enabled
//   POST  {lang, token}      — add a token the user considers significant
//   DELETE {lang, token}     — remove one of the user's own tokens
//   PATCH {lang,oldToken,newToken} — rename one of the user's own tokens
// Defaults on/off:
//   PUT   /settings {lang, defaultsEnabled}  — toggle built-in defaults
//   GET   /settings?lang=x  — read the toggle
// This is the "user can edit & modify SIGNIFICANT_TOPIC_TOKENS" feature, incl.
// the choice to switch the built-in topics off for a language.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { topicState } from '@/lib/topics';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const lang = url.searchParams.get('lang') ?? 'en';

  const state = await topicState(session.id, lang);

  return NextResponse.json({
    lang,
    defaultsEnabled: state.defaultsEnabled,
    defaultTokens: state.defaultTokens,
    userTokens: state.userTokens,
  });
}

export async function POST(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const lang = body.lang?.trim().toLowerCase() || 'en';
  const token = body.token?.trim().toLowerCase();
  if (!token || !/^[a-z]{2,}$/.test(token)) {
    return NextResponse.json({ error: 'token must be 2+ letters' }, { status: 400 });
  }
  if (token.length > 40) {
    return NextResponse.json({ error: 'token too long' }, { status: 400 });
  }

  await sql`
    INSERT INTO user_topic_tokens (id, user_id, lang, token)
    VALUES (${newId('utok')}, ${session.id}, ${lang}, ${token})
    ON CONFLICT (user_id, lang, token) DO NOTHING
  `;
  return NextResponse.json({ lang, token }, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const lang = body.lang?.trim().toLowerCase() || 'en';
  const token = body.token?.trim().toLowerCase();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  await sql`
    DELETE FROM user_topic_tokens
    WHERE user_id = ${session.id} AND lang = ${lang} AND token = ${token}
  `;
  return NextResponse.json({ ok: true });
}

// PATCH — rename one of the user's own topics (delete + re-add in one step).
export async function PATCH(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; oldToken?: string; newToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const lang = body.lang?.trim().toLowerCase() || 'en';
  const oldToken = body.oldToken?.trim().toLowerCase();
  const newToken = body.newToken?.trim().toLowerCase();
  if (!oldToken || !newToken) return NextResponse.json({ error: 'oldToken and newToken required' }, { status: 400 });
  if (!/^[a-z]{2,}$/.test(newToken)) {
    return NextResponse.json({ error: 'token must be 2+ letters' }, { status: 400 });
  }

  const updated = await sql`
    UPDATE user_topic_tokens
    SET token = ${newToken}
    WHERE user_id = ${session.id} AND lang = ${lang} AND token = ${oldToken}
    RETURNING token
  `;
  if (updated.length === 0) {
    return NextResponse.json({ error: 'token not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, token: newToken });
}