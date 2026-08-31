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
import { cookies } from 'next/headers';

export interface SessionUser {
  id: string;
  email?: string | null;
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (session?.user?.id) {
    return { id: session.user.id, email: session.user.email ?? null };
  }

  if (process.env.NODE_ENV === 'development') {
    const jar = await cookies();
    const devAuth = jar.get('dev-auth');
    if (devAuth?.value === '1') {
      return {
        id: 'user_demo',
        email: process.env.DEMO_EMAIL ?? 'demo@timeline.news',
      };
    }
  }

  return null;
}