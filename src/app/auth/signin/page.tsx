'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In dev, EMAIL_SERVER is usually absent — offer a one-click demo login.
  const isDev = process.env.NODE_ENV === 'development';
  // Google sign-in shows only if enabled in .env (AUTH_GOOGLE_ID/SECRET set).
  const hasGoogle = Boolean(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ID);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await signIn('email', { email, redirect: false, callbackUrl: '/' });
    if (res?.error) setError(res.error);
    else setSent(true);
  }

  async function devLogin() {
    setError(null);
    const res = await fetch('/api/dev-login');
    if (res.ok) window.location.href = '/';
    else setError('dev login unavailable');
  }

  return (
    <div className="wrap" style={{ maxWidth: 400 }}>
      <h1>Sign in to News Timeline</h1>

      {hasGoogle && (
        <>
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            style={{ width: '100%', padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.7-.3-2.5H12v4.7h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.3 21.3 7.4 24 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.4l4-3.1z" />
              <path fill="#EA4335" d="M12 4.7c1.8 0 3.3.6 4.6 1.8L19.8 3C17.9 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.4 6.6l4 3.1C6.3 6.8 8.9 4.7 12 4.7z" />
            </svg>
            Continue with Google
          </button>
          <div style={{ textAlign: 'center', color: 'var(--muted)', margin: '4px 0 12px' }}>or</div>
        </>
      )}

      {sent ? (
        <p>Check your inbox for a magic link.</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <button type="submit">Continue with email</button>
        </form>
      )}

      {isDev && (
        <button
          onClick={devLogin}
          style={{ marginTop: 14, width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: 6 }}
        >
          Demo login (dev only)
        </button>
      )}
      {error && <p style={{ color: '#e06c6c' }}>{error}</p>}
    </div>
  );
}