'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TopicsEditor from './topics-editor';
import LogoutButton from '@/components/logout-button';

type Source = {
  id: string;
  name: string;
  feedUrl: string;
  adapterType: string;
  region: string | null;
  active: boolean;
};

export default function SourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [region, setRegion] = useState('');
  const [adapterType, setAdapterType] = useState<'rss' | 'html'>('rss');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; feedUrl: string; region: string; active: boolean }>({
    name: '', feedUrl: '', region: '', active: true,
  });
  // Bump to refetch after any mutation (add/edit/delete).
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/sources');
        if (res.status === 401) { router.replace('/auth/signin'); return; }
        const data = await res.json();
        if (alive) setSources(data.sources ?? []);
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
    setError(null);
    setMsg(null);
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, feedUrl, region: region || undefined, adapterType }),
    });
    if (res.ok) {
      setName('');
      setFeedUrl('');
      setRegion('');
      setAdapterType('rss');
      setMsg('Subscribed. Add a few, then run the pipeline to build your timeline.');
      setRevision((r) => r + 1);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to add feed');
    }
  }

  function startEdit(s: Source) {
    setEditingId(s.id);
    setEditForm({ name: s.name, feedUrl: s.feedUrl, region: s.region ?? '', active: s.active });
    setError(null);
  }

  async function saveEdit(s: Source) {
    const res = await fetch(`/api/sources/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name.trim(),
        feedUrl: editForm.feedUrl.trim(),
        region: editForm.region.trim() || null,
        active: editForm.active,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      setMsg('Source updated.');
      setRevision((r) => r + 1);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to update source');
    }
  }

  async function deleteSource(s: Source) {
    if (!confirm(`Delete source "${s.name}"? Its articles will be removed.`)) return;
    const res = await fetch(`/api/sources/${s.id}`, { method: 'DELETE' });
    if (res.ok) {
      setMsg(`Deleted "${s.name}".`);
      setRevision((r) => r + 1);
    } else {
      setError('failed to delete source');
    }
  }

  return (
    <div className="wrap">
      <nav className="top">
        <Link href="/">← Timeline</Link>
        <LogoutButton />
      </nav>
      <h1>Your Sources</h1>
      <p className="tagline">
        Add any RSS/Atom feed URL. The generic RSS adapter ingests whatever you pick.
      </p>

      <form onSubmit={addSource} style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ fontSize: '0.9rem' }}>
            <input type="radio" name="atype" checked={adapterType === 'rss'} onChange={() => setAdapterType('rss')} /> RSS / Atom feed
          </label>
          <label style={{ fontSize: '0.9rem' }}>
            <input type="radio" name="atype" checked={adapterType === 'html'} onChange={() => setAdapterType('html')} /> HTML page (no RSS)
          </label>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. BBC World)" required />
        <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder={adapterType === 'rss' ? 'Feed URL (e.g. https://feeds.bbci.co.uk/news/world/rss.xml)' : 'Page URL (e.g. https://news.example.com/world)'} required />
        <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional)" />
        <button type="submit">Add source</button>
      </form>

      {error && <p style={{ color: '#e06c6c' }}>{error}</p>}
      {msg && <p style={{ color: '#4caf7d' }}>{msg}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : sources.length === 0 ? (
        <p className="empty">No sources yet. Add one above.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {sources.map((s) => (
            <li key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              {editingId === s.id ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" />
                  <input value={editForm.feedUrl} onChange={(e) => setEditForm({ ...editForm, feedUrl: e.target.value })} placeholder="Feed URL" />
                  <input value={editForm.region} onChange={(e) => setEditForm({ ...editForm, region: e.target.value })} placeholder="Region (optional)" />
                  <label style={{ fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Active
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveEdit(s)}>Save</button>
                    <button onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span>
                      <strong>{s.name}</strong>{' '}
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {s.region ?? ''} {!s.active && <b style={{ color: '#e0a' }}>(inactive)</b>}
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => startEdit(s)}>Edit</button>
                      <button onClick={() => deleteSource(s)} style={{ color: '#e06c6c' }}>Delete</button>
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
                    {s.feedUrl}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <TopicsEditor />
    </div>
  );
}