// ============================================================================
// session.ts — one place to resolve the current user, shared by server
// components and API routes.
//
// Normal path: Auth.js `auth()`. 
// DEV bypass: Auth.js v5 encrypts its session cookie with the secret, so a
// hand-crafted cookie won't authenticate. In development only, when the
// `dev-auth=1` marker cookie is set (by /api/dev-login), fall back to the
// seeded demo user. This is strictly NODE_ENV=development-guarded so it can
// never apply to a production build.
// ============================================================================
import { auth } from '@/auth';
import { sql } from '@/lib/db';
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
      return {
        id: session.user.id,
        email: session.user.email ?? null,
        role: await userRole(session.user.id),
      };
    }
  } catch {
    // fall through to dev bypass below
  }

  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies();
    const devAuth = jar.get('dev-auth');
    if (devAuth?.value === '1') {
      return {
        id: 'user_demo',
        email: process.env.DEMO_EMAIL ?? 'demo@timeline.news',
        role: await userRole('user_demo'),
      };
    }
  }

  return null;
}

async function userRole(userId: string): Promise<'admin' | 'user'> {
  try {
    const rows = await sql`SELECT role FROM users WHERE id = ${userId} LIMIT 1`;
    return rows.length && rows[0].role === 'admin' ? 'admin' : 'user';
  } catch {
    return 'user';
  }
}