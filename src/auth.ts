// ============================================================================
// auth.ts — NextAuth v5 config. Email magic-link provider (no passwords to
// store — aligns with the "one click in" UX). Uses a small native Adapter
// (src/lib/db-adapter.ts) backed by our Postgres schema.
//
// EMAIL_SERVER_ env must be fully set in .env / Vercel for magic links to work.
// If it's absent (dev without an SMTP provider), we still build and serve the
// app, but sign-in is unavailable until it's configured. Nodemailer throws at
// import time if `server` is falsy, so we only mount the provider when set.
// ============================================================================
import NextAuth from 'next-auth';
import Email from 'next-auth/providers/email';
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  providers: emailProvider(),
  session: { strategy: 'database' },
  pages: { signIn: '/auth/signin' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});