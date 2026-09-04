// ============================================================================
// auth.ts — NextAuth v5 config. Two sign-in options:
//   1. Google OAuth (when AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set)
//   2. Email magic-link (real SMTP in prod; dev capture when no SMTP)
// Uses a small native Adapter (src/lib/db-adapter.ts) backed by our Postgres.
//
// EMAIL DELIVERY:
//   - prod + EMAIL_SERVER set     -> real nodemailer transport sends the link
//   - dev  (NODE_ENV=dev, no SMTP) -> capture the magic link to a local file
//        (`/tmp/news-timeline-magic-link.txt` + console) so you can complete a
//        real sign-in without a mail server. The token/verify/session flow is
//        unchanged and real.
//   - prod without EMAIL_SERVER   -> email provider not mounted; email sign-in
//        is unavailable until SMTP is configured (Google still available).
// Docs: https://authjs.dev
// ============================================================================
import NextAuth from 'next-auth';
import Email from 'next-auth/providers/email';
import Google from 'next-auth/providers/google';
import { writeFileSync } from 'node:fs';
import { authAdapter } from './lib/db-adapter';

/** Dev-only: capture the magic link to the console + a file instead of emailing. */
function devSendVerificationRequest(params: { url: string; identifier: string }) {
  console.log(`\n[MAGIC LINK → ${params.identifier}]\n  ${params.url}\n`);
  writeFileSync('/tmp/news-timeline-magic-link.txt', `${params.url}\n`, { flag: 'a' });
}

function emailProvider() {
  const resendKey = process.env.SMTP_PROVIDER_SECRET;
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM ?? 'News Timeline <noreply@timeline.news>';
  const isDev = process.env.NODE_ENV === 'development';

  // 1. Resend SMTP composed from the API key — the canonical way this app
  //    sends magic links. smtp://resend:KEY@smtp.resend.com:587
  if (resendKey) {
    return [Email({ server: `smtp://resend:${resendKey}@smtp.resend.com:587`, from })];
  }
  // 2. A full SMTP URL wins if explicitly set (generic SMTP provider).
  if (server) {
    return [Email({ server, from })];
  }
  // 3. Dev: capture the magic link to console + a file instead of emailing.
  if (isDev) {
    return [
      Email({
        server: 'smtp://capture:capture@localhost:25', // never used (custom send)
        from,
        sendVerificationRequest: devSendVerificationRequest,
      }),
    ];
  }
  return [];
}

function googleProvider() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return [];
  return [
    Google({
      clientId,
      clientSecret,
      // Allow OAuth sign-in to merge into an existing account that was created
      // via another provider (e.g. the email magic-link) with the SAME email.
      // Safe here because both providers verify the email: a magic-link proves
      // ownership, and Google returns a Google-verified email, so linking them
      // to one user is correct rather than a takeover vector.
      allowDangerousEmailAccountLinking: true,
    }),
  ];
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