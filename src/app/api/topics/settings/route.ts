// ============================================================================
// /api/topics/settings — per-language control over whether built-in default
// significance topics apply.
//   GET ?lang=en       -> { lang, defaultsEnabled }
//   PUT {lang, defaultsEnabled} -> set it (upsert into user_topic_settings)
// When defaultsEnabled is false, scoring for that language uses ONLY the user's
// own tokens. This is the "user may not want the default topics" toggle.
// ============================================================================
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';

export async function GET(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const lang = (new URL(req.url).searchParams.get('lang') ?? 'en').toLowerCase();
  const rows = await sql`
    SELECT defaults_enabled AS de FROM user_topic_settings
    WHERE user_id = ${session.id} AND lang = ${lang}
  `;
  // default true when no row exists
  return NextResponse.json({ lang, defaultsEnabled: rows.length === 0 ? true : rows[0].de === true });
}

export async function PUT(req: Request) {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { lang?: string; defaultsEnabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const lang = body.lang?.trim().toLowerCase() || 'en';
  if (typeof body.defaultsEnabled !== 'boolean') {
    return NextResponse.json({ error: 'defaultsEnabled (boolean) required' }, { status: 400 });
  }

  await sql`
    INSERT INTO user_topic_settings (user_id, lang, defaults_enabled)
    VALUES (${session.id}, ${lang}, ${body.defaultsEnabled})
    ON CONFLICT (user_id, lang) DO UPDATE SET defaults_enabled = ${body.defaultsEnabled}
  `;
  return NextResponse.json({ ok: true, lang, defaultsEnabled: body.defaultsEnabled });
}