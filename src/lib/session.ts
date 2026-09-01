// ============================================================================
// session.ts — one place to resolve the current user, shared by server
// components and API routes.
//
// Admin role is EXPLICIT: a user is an admin iff their email is listed in the
// ADMIN_EMAILS env var (comma-separated). There is no silent default admin and
// no admin-by-user_id. The dev demo login is a NORMAL user unless your own
// email is in ADMIN_EMAILS.
//
// Normal path: Auth.js `auth()`.
// DEV bypass: Auth.js v5 encrypts its session cookie with the secret, so a
// hand-crafted cookie won't authenticate. In development only, when the
// `dev-auth=1` marker cookie is set (by /api/dev-login), fall back to the
// seeded demo user. Strictly NODE_ENV=development-guarded.
// ============================================================================
import { auth } from '@/auth';
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  email?: string | null;
  role: 'admin' | 'user';
}

export async function currentUser(): Promise<SessionUser | null> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const email = session.user.email ?? null;
      return { id: session.user.id, email, role: userRole(email) };
    }
  } catch {
    // fall through to dev bypass below
  }

  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies();
    const devAuth = jar.get('dev-auth');
    if (devAuth?.value === '1') {
      const email = process.env.DEMO_EMAIL ?? 'demo@timeline.news';
      return { id: 'user_demo', email, role: userRole(email) };
    }
  }

  return null;
}

/**
 * Admin is decided purely by email membership in ADMIN_EMAILS (comma-separated).
 * Deterministic, no DB lookup, no silent admin — exactly what makes it safe.
 * E.g. ADMIN_EMAILS=demo@timeline.news,guido@example.com
 */
function userRole(email: string | null): 'admin' | 'user' {
  if (!email) return 'user';
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase()) ? 'admin' : 'user';
}