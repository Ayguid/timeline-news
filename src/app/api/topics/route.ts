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

// GET — for admins, returns the full global default topic list (all languages).
// Scope is admin-only; normal users get their own topic state via ?lang=.
export async function GET(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const lang = url.searchParams.get('lang');

  // admin-only: the whole global default list (all languages)
  if (url.searchParams.get('global') === 'true') {
    if (session.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const rows = await sql`SELECT lang, token FROM significant_topics ORDER BY lang, token`;
    return NextResponse.json({ defaults: rows });
  }

  const l = lang ?? 'en';
  const state = await topicState(session.id, l);
  return NextResponse.json({ lang: l, defaults: state.defaults, userTokens: state.userTokens });
}

// POST — add a topic. Normal: user_topic_tokens. Admin (+scope:"global"): the
// shared significant_topics defaults for every user.
export async function POST(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; token?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const lang = (body.lang ?? 'en').trim().toLowerCase();
  const token = body.token?.trim().toLowerCase();
  if (!token || !/^[a-z]{2,}$/.test(token)) {
    return NextResponse.json({ error: 'token must be 2+ letters' }, { status: 400 });
  }
  if (token.length > 40) return NextResponse.json({ error: 'token too long' }, { status: 400 });

  if (body.scope === 'global') {
    if (session.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    await sql`
      INSERT INTO significant_topics (id, lang, token)
      VALUES (${newId('gtop')}, ${lang}, ${token})
      ON CONFLICT (lang, token) DO NOTHING
    `;
    return NextResponse.json({ lang, token, scope: 'global' }, { status: 201 });
  }

  await sql`
    INSERT INTO user_topic_tokens (id, user_id, lang, token)
    VALUES (${newId('utok')}, ${session.id}, ${lang}, ${token})
    ON CONFLICT (user_id, lang, token) DO NOTHING
  `;
  return NextResponse.json({ lang, token }, { status: 201 });
}

// DELETE — remove a topic. Normal: user_topic_tokens. Admin (+scope:"global"):
// remove a shared default from significant_topics (also drops the not-disabled
// row bookkeeping for users who had turned it off vs. now it's gone entirely).
export async function DELETE(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; token?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const lang = (body.lang ?? 'en').trim().toLowerCase();
  const token = body.token?.trim().toLowerCase();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  if (body.scope === 'global') {
    if (session.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    // Deleting a global default also clears its per-user "disabled" rows,
    // since the token no longer exists to be disabled.
    await sql`
      DELETE FROM user_disabled_default_topics
      WHERE lang = ${lang} AND token = ${token}
    `;
    await sql`DELETE FROM significant_topics WHERE lang = ${lang} AND token = ${token}`;
    return NextResponse.json({ ok: true, scope: 'global' });
  }

  await sql`
    DELETE FROM user_topic_tokens
    WHERE user_id = ${session.id} AND lang = ${lang} AND token = ${token}
  `;
  return NextResponse.json({ ok: true });
}

// PATCH — rename a topic. Normal: user_topic_tokens. Admin (+scope:"global"):
// rename a shared default in significant_topics (updates disabled-bookkeeping).
export async function PATCH(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; oldToken?: string; newToken?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const lang = (body.lang ?? 'en').trim().toLowerCase();
  const oldToken = body.oldToken?.trim().toLowerCase();
  const newToken = body.newToken?.trim().toLowerCase();
  if (!oldToken || !newToken) return NextResponse.json({ error: 'oldToken and newToken required' }, { status: 400 });
  if (!/^[a-z]{2,}$/.test(newToken)) {
    return NextResponse.json({ error: 'token must be 2+ letters' }, { status: 400 });
  }

  if (body.scope === 'global') {
    if (session.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const updated = await sql`
      UPDATE significant_topics
      SET token = ${newToken}
      WHERE lang = ${lang} AND token = ${oldToken}
      RETURNING token
    `;
    if (updated.length === 0) return NextResponse.json({ error: 'token not found' }, { status: 404 });
    // Keep disabled-bookkeeping consistent: rename the disabled row too.
    await sql`
      UPDATE user_disabled_default_topics SET token = ${newToken}
      WHERE lang = ${lang} AND token = ${oldToken}
    `;
    return NextResponse.json({ ok: true, token: newToken, scope: 'global' });
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