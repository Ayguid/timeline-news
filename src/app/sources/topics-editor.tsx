'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const LANGS = ['en', 'es'];

type DefaultTopic = { token: string; enabled: boolean };

export default function TopicsEditor() {
  const router = useRouter();
  const [lang, setLang] = useState('en');
  const [defaults, setDefaults] = useState<DefaultTopic[]>([]);
  const [userTokens, setUserTokens] = useState<string[]>([]);
  const [newToken, setNewToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  // inline edit state
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // Bump to refetch after any change.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/topics?lang=${lang}`);
        if (res.status === 401) { router.replace('/auth/signin'); return; }
        const data = await res.json();
        if (!alive) return;
        setDefaults(data.defaults ?? []);
        setUserTokens(data.userTokens ?? []);
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

  /** Toggle a single built-in default topic on/off. */
  async function toggleDefault(t: DefaultTopic) {
    setError(null);
    const res = await fetch('/api/topics/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, token: t.token, enabled: !t.enabled }),
    });
    if (res.ok) setRevision((r) => r + 1);
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to update topic');
    }
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Significance topics</h2>
      <p className="tagline">
        Keywords that flag an event as important for <em>you</em> (per language).
        Switch individual built-in topics on or off, and add your own.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
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
        <strong style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Built-in ({lang.toUpperCase()}):</strong>{' '}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {defaults.map((t) => (
            <button
              key={t.token}
              type="button"
              onClick={() => toggleDefault(t)}
              title={t.enabled ? 'Enabled — click to turn off' : 'Disabled — click to enable'}
              style={{ padding: '4px 10px', cursor: 'pointer', border: t.enabled ? '1px solid var(--approve)' : '1px dashed var(--line)', color: t.enabled ? 'var(--text)' : 'var(--muted)', borderRadius: 999, background: t.enabled ? 'rgba(76,175,125,.12)' : 'transparent' }}
            >
              {t.token} {t.enabled ? '·' : ' ⊘'}
            </button>
          ))}
        </div>
      </div>

      {userTokens.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Your additions ({lang.toUpperCase()}):</strong>{' '}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {userTokens.map((t) => (
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
                <span key={t} className="badge">
                  {t}{' '}
                  <span style={{ cursor: 'pointer' }} title="rename" onClick={() => beginEdit(t)}>✎</span>{' '}
                  <span style={{ cursor: 'pointer' }} title="remove" onClick={() => removeToken(t)}>✕</span>
                </span>
              )
            ))}
          </div>
        </div>
      )}

      <form onSubmit={addToken} style={{ display: 'flex', gap: 8, marginBottom: 8, maxWidth: 380 }}>
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
    </section>
  );
}