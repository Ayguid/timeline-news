'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineEvent, TimelineCursor } from '@/lib/timeline';

function fmtDate(iso: Date | string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

interface PageRes {
  events: TimelineEvent[];
  nextCursor: TimelineCursor | null;
  hasMore: boolean;
}

async function fetchPage(cursor: TimelineCursor | null): Promise<PageRes> {
  const params = new URLSearchParams({ limit: '40' });
  if (cursor) {
    params.set('date', cursor.date);
    params.set('id', cursor.id);
  }
  const res = await fetch(`/api/timeline?${params.toString()}`);
  if (!res.ok) throw new Error('failed to load timeline');
  return res.json();
}

export default function TimelineFeed() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [cursor, setCursor] = useState<TimelineCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || initial) return;
    loadingRef.current = true;
    try {
      const res = await fetchPage(cursor);
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.events.filter((e) => !seen.has(e.id))];
      });
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch {
      setError('Could not load more.');
    } finally {
      loadingRef.current = false;
    }
  }, [cursor, hasMore, initial]);

  // Initial load on mount (setState only in async callbacks — standard pattern).
  useEffect(() => {
    let alive = true;
    loadingRef.current = true;
    (async () => {
      try {
        const res = await fetchPage(null);
        if (!alive) return;
        setEvents(res.events);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
        setInitial(false);
      } catch {
        if (alive) setError('Could not load the timeline.');
      } finally {
        if (alive) {
          setLoading(false);
          loadingRef.current = false;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Sentinel: when the bottom sentinel becomes visible, fetch the next page.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' }, // warm up before reaching the very bottom
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div className="timeline">
      {error && <div className="empty">{error}</div>}
      {!initial && events.length === 0 ? (
        <div className="empty">
          No approved events yet. Run the pipeline (<code>npx tsx scripts/run-pipeline.ts</code>)
          after subscribing to sources.
        </div>
      ) : (
        <>
          {events.map((ev) => (
            <div key={ev.id} className={`event ${ev.status}`}>
              <div className="event-date">{fmtDate(ev.eventDate)}</div>
              <h2>{ev.title}</h2>
              {ev.summary && ev.summary !== ev.title && <div className="summary">{ev.summary}</div>}
              <div className="scores">
                <span className="badge">{ev.sourceCount} source(s)</span>
                <span className="badge">sig {ev.significanceScore}</span>
              </div>
              {ev.articles.length > 1 ? (
                <details className="framing" open={ev.articles.length <= 3}>
                  <summary>
                    <strong>How each outlet framed it</strong>{' '}
                    <span className="muted-note">({ev.articles.length} stories)</span>
                  </summary>
                  <div className="framed">
                    {ev.articles.map((a, i) => (
                      <div className="framed-card" key={i}>
                        <span className="framed-source">{a.sourceName}</span>
                        {a.articleUrl ? (
                          <a href={a.articleUrl} target="_blank" rel="noopener noreferrer">{a.title}</a>
                        ) : (
                          <span>{a.title || a.sourceName}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <div className="sources">
                  {ev.articles.map((a, i) => (
                    <span key={i}>
                      {a.articleUrl ? (
                        <a className="source-link" href={a.articleUrl} target="_blank" rel="noopener noreferrer">
                          {a.sourceName} ↗
                        </a>
                      ) : (
                        <span className="source-link">{a.sourceName}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={sentinelRef} className="scroll-sentinel" aria-hidden="true">
            {hasMore ? (loading ? 'Loading…' : '') : <p className="end">— end —</p>}
          </div>
        </>
      )}
      {loading && initial && <div className="empty">Loading…</div>}
    </div>
  );
}