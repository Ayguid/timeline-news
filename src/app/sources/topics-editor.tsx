'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, usePending } from '@/components/button';

const LANGS = ['en', 'es'];

type DefaultTopic = { token: string; enabled: boolean };

export default function TopicsEditor({ role }: { role: 'admin' | 'user' }) {
  const router = useRouter();
  const isAdmin = role === 'admin';
  const [lang, setLang] = useState('en');
  const [defaults, setDefaults] = useState<DefaultTopic[]>([]);
  const [userTokens, setUserTokens] = useState<string[]>([]);
  const [newToken, setNewToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  // global (admin-managed) defaults, all langs
  const [globalTokens, setGlobalTokens] = useState<{ lang: string; token: string }[]>([]);
  const [newGlobal, setNewGlobal] = useState('');
  const [globalLang, setGlobalLang] = useState('en');
  // inline edit state
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // Bump to refetch after any change.
  const [revision, setRevision] = useState(0);
  // pending actions — disable + spinner to prevent double-submit
  const { run, isPending } = usePending();

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

  useEffect(() => {
    let alive = true;
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await fetch('/api/topics?global=true');
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setGlobalTokens((data.defaults ?? []).filter((x: { token: string }) => x.token));
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [isAdmin, router, revision]);

  // --- admin: manage GLOBAL (shared) default topics ---
  async function addGlobal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    await run('add-global', async () => {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: globalLang, token: newGlobal, scope: 'global' }),
      });
      if (res.ok) { setNewGlobal(''); setRevision((r) => r + 1); }
      else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'failed to add global token'); }
    });
  }
  async function removeGlobal(langG: string, token: string) {
    await run(`rmg:${token}`, async () => {
      await fetch('/api/topics', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang: langG, token, scope: 'global' }),
      });
      setRevision((r) => r + 1);
    });
  }
  function beginEditGlobal(langG: string, token: string) {
    setEditingToken(`${langG}:${token}`);
    setEditValue(token);
    setError(null);
  }
  async function saveEditGlobal(e: React.FormEvent) {
    e.preventDefault();
    if (!editingToken) return;
    const [langG, oldToken] = editingToken.split(':');
    const newToken = editValue.trim().toLowerCase();
    if (!newToken || newToken === oldToken) { setEditingToken(null); return; }
    const res = await fetch('/api/topics', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: langG, oldToken, newToken, scope: 'global' }),
    });
    if (res.ok) { setEditingToken(null); setNewGlobal(''); setRevision((r) => r + 1); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'failed to rename'); setEditingToken(null); }
  }

  async function addToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    await run('add-topic', async () => {
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
    });
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

  /** Toggle a single built-in default topic on/off. Optimistic: flip the chip
   * immediately so there's no flash back to the old state (which caused a
   * double-tap window), then persist; revert only on failure. A revision bump
   * re-syncs from the server. */
  async function toggleDefault(t: DefaultTopic) {
    setError(null);
    const nextEnabled = !t.enabled;
    // optimistic flip
    setDefaults((prev) => prev.map((x) => (x.token === t.token ? { ...x, enabled: nextEnabled } : x)));
    try {
      const res = await fetch('/api/topics/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, token: t.token, enabled: nextEnabled }),
      });
      if (res.ok) {
        setRevision((r) => r + 1);
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'failed to update topic');
        // revert the optimistic flip
        setDefaults((prev) => prev.map((x) => (x.token === t.token ? { ...x, enabled: t.enabled } : x)));
      }
    } catch {
      setDefaults((prev) => prev.map((x) => (x.token === t.token ? { ...x, enabled: t.enabled } : x)));
      setError('network error updating topic');
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
            <Button
              key={t.token}
              variant="pill"
              size="sm"
              loading={isPending(t.token)}
              onClick={() => run(t.token, () => toggleDefault(t))}
              title={t.enabled ? 'Enabled — click to turn off' : 'Disabled — click to enable'}
              style={{ padding: '4px 10px', cursor: 'pointer', border: t.enabled ? '1px solid var(--approve)' : '1px dashed var(--line)', color: t.enabled ? 'var(--text)' : 'var(--muted)', borderRadius: 999, background: t.enabled ? 'rgba(76,175,125,.12)' : 'transparent' }}
            >
              {t.token} {t.enabled ? '·' : ' ⊘'}
            </Button>
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
                  <span style={{ cursor: 'pointer' }} title="remove" onClick={() => run(`rm:${t}`, () => removeToken(t))}>✕</span>
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
        <Button type="submit" loading={isPending('add-topic')} disabled={!newToken.trim()}>
        {isPending('add-topic') ? 'Adding…' : 'Add to my topics'}
      </Button>
      </form>
      {error && <p style={{ color: '#e06c6c' }}>{error}</p>}

      {isAdmin && (
        <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
          <h3>Global topics (admin)</h3>
          <p className="tagline">
            Shared default significance topics for all users. When a global token is
            removed, users’ per-topic off-switches for it are cleaned up too.
          </p>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>current:</strong>{' '}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {globalTokens.map(({ lang: lg, token }) =>
                editingToken === `${lg}:${token}` ? (
                  <form key={`${lg}:${token}`} onSubmit={saveEditGlobal} style={{ display: 'inline-flex', gap: 6, marginRight: 6 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{lg.toUpperCase()}</span>
                    <input value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus pattern="[a-z]{2,40}" style={{ width: 120 }} />
                    <button type="submit">✓</button>
                    <button type="button" onClick={() => setEditingToken(null)}>✕</button>
                  </form>
                ) : (
                  <span key={`${lg}:${token}`} className="badge">
                    {lg.toUpperCase()}:{token}{' '}
                    <span style={{ cursor: 'pointer' }} title="rename" onClick={() => beginEditGlobal(lg, token)}>✎</span>{' '}
                    <span style={{ cursor: 'pointer' }} title="remove" onClick={() => removeGlobal(lg, token)}>✕</span>
                  </span>
                ),
              )}
            </div>
          </div>
          <form onSubmit={addGlobal} style={{ display: 'flex', gap: 8, marginBottom: 8, maxWidth: 420 }}>
            <select value={globalLang} onChange={(e) => setGlobalLang(e.target.value)}>
              {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
            <input
              value={newGlobal}
              onChange={(e) => setNewGlobal(e.target.value)}
              placeholder="new global keyword"
              pattern="[a-z]{2,40}"
              required
            />
            <Button type="submit" loading={isPending('add-global')} disabled={!newGlobal.trim()}>
              Add global
            </Button>
          </form>
          {error && <p style={{ color: '#e06c6c' }}>{error}</p>}
        </section>
      )}
    </section>
  );
}