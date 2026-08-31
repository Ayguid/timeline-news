'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Magic link. Without a real SMTP provider this requires EMAIL_SERVER;
    // the demo install checks in via the seeded email.
    const res = await signIn('email', { email, redirect: false, callbackUrl: '/' });
    if (res?.error) setError(res.error);
    else setSent(true);
  }

  return (
    <div className="wrap">
      <h1>Sign in</h1>
      {sent ? (
        <p>Check your inbox for a magic link.</p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          <button type="submit">Send magic link</button>
        </form>
      )}
      {error && <p style={{ color: '#e06c6c' }}>{error}</p>}
    </div>
  );
}