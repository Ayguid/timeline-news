'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/logout-button';
import TopicsEditor from './topics-editor';
import { Button, usePending } from '@/components/button';

type Source = {
  id: string;
  name: string;
  feedUrl: string;
  adapterType: string;
  region: string | null;
  active: boolean;
  enabled?: boolean; // global sources only: user's selection
};

export default function SourcesPage() {
  const router = useRouter();
  const [global, setGlobal] = useState<Source[]>([]);
  const [personal, setPersonal] = useState<Source[]>([]);
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [personalCap, setPersonalCap] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // add form (personal source for everyone; global source for admins)
  const [name, setName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [region, setRegion] = useState('');
  const [adapterType, setAdapterType] = useState<'rss' | 'html'>('rss');
  const [adminMode, setAdminMode] = useState(false);
  // personal-source inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', feedUrl: '', region: '', active: true });
  const [revision, setRevision] = useState(0);
  // pending actions (toggle/add/edit/delete) to disable buttons against double-clicks
  const { run, isPending } = usePending();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/sources');
        if (res.status === 401) { router.replace('/auth/signin'); return; }
        const data = await res.json();
        if (!alive) return;
        setGlobal(data.global ?? []);
        setPersonal(data.personal ?? []);
        setRole(data.role ?? 'user');
        setPersonalCap(data.personalCap ?? 5);
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router, revision]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Admins can choose global vs personal via the checkbox; everyone else
      // always adds a personal source (global omitted -> falsy).
      body: JSON.stringify({ name, feedUrl, region: region || undefined, adapterType, global: role === 'admin' ? adminMode : false }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setName(''); setFeedUrl(''); setRegion('');
      setMsg(adminMode ? 'Global source added (visible to everyone).' : 'Personal source added to My sources. Run the pipeline to pick it up.');
      setRevision((r) => r + 1);
    } else {
      setError(d.error ?? 'failed to add source');
    }
  }

  /** Toggle a GLOBAL source in the user's selection. */
  async function toggleGlobal(id: string, enabled: boolean) {
    setError(null);
    const res = await fetch(`/api/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (res.ok) setRevision((r) => r + 1);
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'failed to toggle'); }
  }

  function startEdit(s: Source) {
    setEditingId(s.id);
    setEditForm({ name: s.name, feedUrl: s.feedUrl, region: s.region ?? '', active: s.active });
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name.trim(),
        feedUrl: editForm.feedUrl.trim(),
        region: editForm.region.trim() || null,
        active: editForm.active,
      }),
    });
    if (res.ok) { setEditingId(null); setMsg('Source updated.'); setRevision((r) => r + 1); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'failed to update'); }
  }

  async function deleteSource(id: string, name: string) {
    if (!confirm(`Delete source \"${name}\"?`)) return;
    const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    if (res.ok) { setMsg(`Deleted \"${name}\".`); setRevision((r) => r + 1); }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'failed to delete'); }
  }

  const globalOn = global.filter((g) => g.enabled).length;

  return (
    <div className="wrap">
      <nav className="top">
        <Link href="/">← Timeline</Link>
        <LogoutButton />
      </nav>
      <h1>Sources</h1>

      {msg && <p style={{ color: '#4caf7d' }}>{msg}</p>}
      {error && <p style={{ color: '#e06c6c' }}>{error}</p>}

      {/* Add source form */}
      {role === 'admin' && (
        <label style={{ fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <input type="checkbox" checked={adminMode} onChange={(e) => setAdminMode(e.target.checked)} />
          Admin: add as global source (visible to everyone)
        </label>
      )}
      <form onSubmit={addSource} style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ fontSize: '0.9rem' }}>
            <input type="radio" name="atype" checked={adapterType === 'rss'} onChange={() => setAdapterType('rss')} /> RSS / Atom
          </label>
          <label style={{ fontSize: '0.9rem' }}>
            <input type="radio" name="atype" checked={adapterType === 'html'} onChange={() => setAdapterType('html')} /> HTML page
          </label>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. BBC World)" required />
        <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder={adapterType === 'rss' ? 'Feed URL' : 'Page URL'} required />
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional)" />
        <button type="submit">{adminMode && role === 'admin' ? 'Add global source' : `Add my source${role !== 'admin' ? ` (${personal.length}/${personalCap})` : ''}`}</button>
      </form>

      {loading ? <p>Loading…</p> : (
        <>
          {/* Global sources — user's selection */}
          <section style={{ marginBottom: 28 }}>
            <h2>Global sources {role === 'admin' && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>(admin-curated)</span>}</h2>
            <p className="tagline">Stories come from shared sources; tick the ones you want on your timeline. {globalOn}/{global.length} on.</p>
            {global.length === 0 ? (
              <p className="empty">No global sources yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {global.map((g) => (
                  editingId === g.id && role === 'admin' ? (
                    <li key={g.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" style={{ flex: 1 }} />
                          <input value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} placeholder="Region" style={{ width: 140 }} />
                        </div>
                        <input value={editForm.feedUrl} onChange={(e) => setEditForm({ ...editForm, feedUrl: e.target.value })} placeholder="Feed URL" />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => saveEdit(g.id)}>Save</button>
                          <button onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    </li>
                  ) : (
                  <li key={g.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <strong>{g.name}</strong>{' '}
                      <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{g.region ?? ''}</span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{g.feedUrl}</div>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {role === 'admin' && (
                        <>
                          <button onClick={() => startEdit(g)}>Edit</button>
                          <button onClick={() => run(`del:${g.id}`, () => deleteSource(g.id, g.name))} disabled={isPending(`del:${g.id}`)} style={{ color: '#e06c6c' }}>Del</button>
                        </>
                      )}
                      <Button
                        variant="pill"
                        size="sm"
                        loading={isPending(g.id)}
                        onClick={() => run(g.id, () => toggleGlobal(g.id, g.enabled ?? false))}
                        style={{ border: '1px solid' + (g.enabled ? ' var(--approve)' : ' var(--line)'), color: g.enabled ? 'var(--approve)' : 'var(--muted)', borderRadius: 999, padding: '3px 12px', cursor: 'pointer', background: 'none' }}
                      >
                        {g.enabled ? 'On' : 'Off'}
                      </Button>
                    </span>
                  </li>
                  )
                ))}
              </ul>
            )}
          </section>

          {/* Personal sources */}
          <section>
            <h2>My sources {role !== 'admin' && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>({personal.length}/{personalCap})</span>}</h2>
            <p className="tagline">Your own feeds — always shown on your timeline, run on every pipeline pass.</p>
            {personal.length === 0 ? (
              <p className="empty">No personal sources yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {personal.map((s) => (
                  <li key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    {editingId === s.id ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        <input value={editForm.feedUrl} onChange={(e) => setEditForm({ ...editForm, feedUrl: e.target.value })} />
                        <input value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} placeholder="Region" />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => saveEdit(s.id)}>Save</button>
                          <button onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span><strong>{s.name}</strong> {s.region && <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>{s.region}</span>}</span>
                          <span>
                            <button onClick={() => startEdit(s)}>Edit</button>
                            <button onClick={() => deleteSource(s.id, s.name)} style={{ color: '#e06c6c' }}>Delete</button>
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{s.feedUrl}</div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <TopicsEditor />
    </div>
  );
}