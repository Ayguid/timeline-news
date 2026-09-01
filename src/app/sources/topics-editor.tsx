'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * TopicsEditor — lets the user see & edit their personal significance tokens
 * (the "SIGNIFICANT_TOPIC_TOKENS" list, now per-user and per-language).
 * Combine default tokens + user-added tokens = effective scoring list.
 */
const LANGS = ['en', 'es'];

export default function TopicsEditor() {
  const router = useRouter();
  const [lang, setLang] = useState('en');
  const [defaultTokens, setDefaultTokens] = useState<string[]>([]);
  const [userTokens, setUserTokens] = useState<string[]>([]);
  const [defaultsEnabled, setDefaultsEnabled] = useState(true);
  const [newToken, setNewToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  // inline edit state
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // Bump to refetch after add/rename/remove.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/topics?lang=${lang}`);
        if (res.status === 401) { router.replace('/auth/signin'); return; }
        const data = await res.json();
        if (!alive) return;
        setDefaultTokens(data.defaultTokens ?? []);
        setUserTokens(data.userTokens ?? []);
        setDefaultsEnabled(data.defaultsEnabled !== false);
      } catch {
        // ignore
      }
    })();
    return () => { alive = false; };
  }, [lang, router, revision]);

  async function addToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, token: newToken }),
    });
    if (res.ok) {
      setNewToken('');
      setRevision((r) => r + 1);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to add token');
    }
  }

  async function removeToken(token: string) {
    await fetch('/api/topics', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, token }),
    });
    setRevision((r) => r + 1);
  }

  async function toggleDefaults(e: React.FormEvent) {
    e.preventDefault();
    const next = !defaultsEnabled;
    const res = await fetch('/api/topics/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, defaultsEnabled: next }),
    });
    if (res.ok) setDefaultsEnabled(next);
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to update defaults');
    }
  }

  function beginEdit(token: string) {
    setEditingToken(token);
    setEditValue(token);
    setError(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingToken) return;
    const newToken = editValue.trim().toLowerCase();
    if (!newToken || newToken === editingToken) {
      setEditingToken(null);
      return;
    }
    const res = await fetch('/api/topics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, oldToken: editingToken, newToken }),
    });
    if (res.ok) {
      setEditingToken(null);
      setNewToken('');
      setRevision((r) => r + 1);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to rename token');
      setEditingToken(null);
    }
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Significance topics</h2>
      <p className="tagline">
        Keywords that flag an event as important for <em>you</em> (per language).
        You can add your own, rename or remove them, and switch the built-in
        defaults off entirely for a language.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            disabled={l === lang}
            style={{ opacity: l === lang ? 1 : 0.6 }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={defaultsEnabled}
            onChange={(e) => toggleDefaults(e as unknown as React.FormEvent)}
          />
          Use built-in significance topics ({lang.toUpperCase()})
        </label>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
          Off = score only by my own topics for {lang.toUpperCase()}.
        </div>
      </div>

      <form onSubmit={addToken} style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 380 }}>
        <input
          value={newToken}
          onChange={(e) => setNewToken(e.target.value)}
          placeholder="e.g. election"
          pattern="[a-z]{2,40}"
          title="lowercase letters only"
          required
        />
        <button type="submit">Add to my topics</button>
      </form>
      {error && <p style={{ color: '#e06c6c' }}>{error}</p>}

      {userTokens.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Your additions ({lang.toUpperCase()}):</strong>{' '}
          {userTokens.map((t) =>
            editingToken === t ? (
              <form key={t} onSubmit={saveEdit} style={{ display: 'inline-flex', gap: 6, marginRight: 6 }}>
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  pattern="[a-z]{2,40}"
                  style={{ width: 120 }}
                />
                <button type="submit">✓</button>
                <button type="button" onClick={() => setEditingToken(null)}>✕</button>
              </form>
            ) : (
              <span key={t} className="badge" style={{ marginRight: 6 }}>
                {t}{' '}
                <span style={{ cursor: 'pointer' }} title="rename" onClick={() => beginEdit(t)}>✎</span>{' '}
                <span style={{ cursor: 'pointer' }} title="remove" onClick={() => removeToken(t)}>✕</span>
              </span>
            ),
          )}
        </div>
      )}

      <div>
        <strong style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Defaults ({lang.toUpperCase()}):</strong>{' '}
        {defaultTokens.slice(0, 40).map((t) => (
          <span key={t} className="badge" style={{ marginRight: 6 }}>{t}</span>
        ))}
      </div>
    </section>
  );
}