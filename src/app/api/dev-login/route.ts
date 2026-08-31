// ============================================================================
// /api/dev-login — DEVELOPMENT-ONLY bypass: lets the user view the app as the
// seeded demo user without SMTP. Sets a `dev-auth=1` marker cookie that
// src/lib/session.ts honors ONLY when NODE_ENV=development. Returns 404 in any
// non-dev build, so it can never be used against production.
// ============================================================================
import { NextResponse } from 'next/server';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, user: process.env.DEMO_EMAIL ?? 'demo@timeline.news' });
  res.cookies.set('dev-auth', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: false, // localhost HTTP
  });
  return res;
}