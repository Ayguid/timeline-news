'use client';

import { signOut } from 'next-auth/react';

/** Client button that signs the user out (required client-side for next-auth). */
export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/auth/signin' })}
      style={{ background: 'none', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.82rem' }}
    >
      Log out
    </button>
  );
}