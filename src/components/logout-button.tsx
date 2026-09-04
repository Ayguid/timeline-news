'use client';

import { useCallback, useState } from 'react';
import { signOut } from 'next-auth/react';

/**
 * Client button that signs the user out.
 *
 * Auth.js's signOut() only clears the session cookie — it does NOT remove the
 * dev `dev-auth` marker cookie (set by /api/dev-login), so currentUser() would
 * keep resolving to the demo user after logout in dev mode. We explicitly POST
 * /api/dev-logout first to clear that marker (no-op in prod: the route 404s,
 * which the fetch tolerates), then sign out.
 */
export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  const handleLogout = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        await fetch('/api/dev-logout', { method: 'POST' });
      } catch {
        // route 404s in prod — non-fatal, signOut still runs
      }
      await signOut({ callbackUrl: '/auth/signin' });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <button
      onClick={handleLogout}
      disabled={busy}
      style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.82rem' }}
    >
      {busy ? 'Logging out…' : 'Log out'}
    </button>
  );
}