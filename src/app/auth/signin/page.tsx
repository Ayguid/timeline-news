import SignInForm from './sign-in-form';
import { currentUser } from '@/lib/session';
import { redirect } from 'next/navigation';

// Server component: reads server-only env to decide which providers to show,
// then hands flags to the client form. No secrets leak to the browser.
// If already authenticated, send the user to the timeline instead of showing
// the sign-in form (fresh page load / reopened tab / manual URL visit).
export default async function SignInPage() {
  const session = await currentUser();
  if (session?.id) redirect('/');

  const hasGoogle = process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET;
  const hasEmail = !!process.env.EMAIL_SERVER;
  const isDev = process.env.NODE_ENV === 'development';
  // Email form only where it can actually deliver: dev (magic-link capture)
  // or prod with SMTP configured. Without SMTP (your case), email would fail,
  // so we only offer Google.
  const showEmail = hasEmail || isDev;

  return (
    <SignInForm
      hasGoogle={!!hasGoogle}
      showEmail={showEmail}
      isDev={isDev}
    />
  );
}