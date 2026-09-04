// ============================================================================
// /api/dev-logout — DEVELOPMENT-ONLY counterpart to /api/dev-login.
// `signOut()` (Auth.js) only clears the session cookie; it does NOT remove the
// `dev-auth` marker cookie that dev-login set, which would leave `currentUser()`
// resolving to the demo user even after logout. This route clears that marker.
// Returns 404 in any non-dev build, like dev-login.
// ============================================================================
import { NextResponse } from 'next/server';

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('dev-auth', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // expires now → browser drops it
    secure: false,
  });
  return res;
}