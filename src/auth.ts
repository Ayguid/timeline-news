// ============================================================================
// auth.ts — NextAuth v5 config. Two sign-in options:
//   1. Google OAuth (when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set)
//   2. Email magic-link (when EMAIL_SERVER is set)
// Uses a small native Adapter (src/lib/db-adapter.ts) backed by our Postgres.
//
// Providers are mounted only when their env config is present, so the app
// always builds — even with none configured (sign-in is simply unavailable
// until one is added). Docs: https://authjs.dev
// ============================================================================
import NextAuth from 'next-auth';
import Email from 'next-auth/providers/email';
import Google from 'next-auth/providers/google';
import { authAdapter } from './lib/db-adapter';

function emailProvider() {
  const server = process.env.EMAIL_SERVER;
  if (!server) return [];
  return [
    Email({
      server,
      from: process.env.EMAIL_FROM ?? 'News Timeline <noreply@timeline.news>',
    }),
  ];
}

function googleProvider() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return [];
  return [Google({ clientId, clientSecret })];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  providers: [...googleProvider(), ...emailProvider()],
  session: { strategy: 'database' },
  pages: { signIn: '/auth/signin' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});