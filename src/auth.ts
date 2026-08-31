// ============================================================================
// auth.ts — NextAuth v5 config. Email magic-link provider (no passwords to
// store — aligns with the "one click in" UX). Uses a small native Adapter
// (src/lib/db-adapter.ts) backed by our Postgres schema.
// ============================================================================
import NextAuth from 'next-auth';
import Email from 'next-auth/providers/email';
import { authAdapter } from './lib/db-adapter';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: authAdapter,
  providers: [
    Email({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM ?? 'News Timeline <noreply@timeline.news>',
    }),
  ],
  session: { strategy: 'database' },
  pages: { signIn: '/auth/signin' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});