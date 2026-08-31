'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import TopicsEditor from './topics-editor';

type Source = {
  id: string;
  name: string;
  feedUrl: string;
  adapterType: string;
  region: string | null;
  active: boolean;
};

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [region, setRegion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sources');
      if (res.status === 401) {
        window.location.href = '/auth/signin';
        return;
      }
      const data = await res.json();
      setSources(data.sources ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, feedUrl, region: region || undefined }),
    });
    if (res.ok) {
      setName('');
      setFeedUrl('');
      setRegion('');
      setMsg('Subscribed. Add a few, then run the pipeline to build your timeline.');
      await load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'failed to add feed');
    }
  }

  return (
    <div className="wrap">
      <nav className="top">
        <Link href="/">← Timeline</Link>
      </nav>
      <h1>Your Sources</h1>
      <p className="tagline">
        Add any RSS/Atom feed URL. The generic RSS adapter ingests whatever you pick.
      </p>

      <form onSubmit={addSource} style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. BBC World)"
          required
        />
        <input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="Feed URL (e.g. https://feeds.bbci.co.uk/news/world/rss.xml)"
          required
        />
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Region (optional)"
        />
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
              <strong>{s.name}</strong>{' '}
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{s.region}</span>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
                {s.feedUrl}
              </div>
            </li>
          ))}
        </ul>
      )}

      <TopicsEditor />
    </div>
  );
}