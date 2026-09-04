'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function SignInForm({
  hasGoogle,
  showEmail,
  isDev,
}: {
  hasGoogle: boolean;
  showEmail: boolean;
  isDev: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return; // guard against double-submit
    setError(null);
    setSending(true);
    try {
      const res = await signIn('email', { email, redirect: false, callbackUrl: '/' });
      if (res?.error) setError(res.error);
      else setSent(true);
    } finally {
      setSending(false);
    }
  }

  async function devLogin() {
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch('/api/dev-login');
      if (res.ok) router.push('/');
      else setError('dev login unavailable');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">📰</div>
          <h1>News Timeline</h1>
          <p className="auth-sub">Sign in to see a chronological record of what happens in the world.</p>
        </div>

        {hasGoogle ? (
          <>
            <button
              className="btn-google"
              onClick={() => signIn('google', { callbackUrl: '/' })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.7-.3-2.5H12v4.7h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.3 21.3 7.4 24 12 24z" />
                <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l4-3.1z" />
                <path fill="#EA4335" d="M12 4.7c1.8 0 3.3.6 4.6 1.8L19.8 3C17.9 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.4 6.6l4 3.1C6.3 6.8 8.9 4.7 12 4.7z" />
              </svg>
              Continue with Google
            </button>
            {showEmail && <div className="auth-divider"><span>or</span></div>}
          </>
        ) : showEmail ? (
          <div className="auth-divider"><span>or</span></div>
        ) : null}

        {showEmail &&
          (sent ? (
            <div className="auth-sent">
              <p>Check your inbox for a magic link.</p>
              <p className="auth-hint">No email? In development the link is printed to the terminal (look for <code>MAGIC LINK</code>).</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="auth-form">
              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={sending}
              />
              <button type="submit" className="btn-primary" disabled={sending}>
                {sending ? 'Sending…' : 'Continue with email'}
              </button>
            </form>
          ))}

        {error && <p className="auth-error">{error}</p>}

        {isDev && (
          <button className="btn-ghost" onClick={devLogin}>
            Demo login (dev only)
          </button>
        )}
      </div>
    </div>
  );
}