'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * TopicsEditor — lets the user see & edit their personal significance tokens
 * (the "SIGNIFICANT_TOPIC_TOKENS" list, now per-user and per-language).
 * Combine default tokens + user-added tokens = effective scoring list.
 */
const LANGS = ['en', 'es'];

export default function TopicsEditor() {
  const [lang, setLang] = useState('en');
  const [defaultTokens, setDefaultTokens] = useState<string[]>([]);
  const [userTokens, setUserTokens] = useState<string[]>([]);
  const [newToken, setNewToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  // inline edit state
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const load = useCallback(async (l: string) => {
    const res = await fetch(`/api/topics?lang=${l}`);
    if (res.status === 401) {
      window.location.href = '/auth/signin';
      return;
    }
    const data = await res.json();
    setDefaultTokens(data.defaultTokens ?? []);
    setUserTokens(data.userTokens ?? []);
  }, []);

  useEffect(() => { load(lang); }, [lang, load]);

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
      await load(lang);
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
    await load(lang);
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
      await load(lang);
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
        Defaults show for reference; your additions are merged in at scoring time.
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