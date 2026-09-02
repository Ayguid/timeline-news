import { currentUser } from '@/lib/session';
import { getTimelineEvents, TimelineEvent } from '@/lib/timeline';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/logout-button';

function fmtDate(iso: Date | string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const session = await currentUser();
  if (!session?.id) redirect('/auth/signin');

  const { events } = await getTimelineEvents();

  return (
    <div className="wrap">
      <nav className="top">
        <span>{session.email ?? 'Demo'}</span>
        <Link href="/sources">Sources</Link>
        <LogoutButton />
      </nav>

      <div className="lockup">
        <h1>News Timeline</h1>
        <span className="tagline">chronological record · {events.length} event(s)</span>
      </div>

      {events.length === 0 ? (
        <div className="empty">
          No approved events yet. Run the pipeline (<code>npx tsx scripts/run-pipeline.ts</code>)
          after subscribing to sources.
        </div>
      ) : (
        <div className="timeline">
          {events.map((ev) => (
            <div key={ev.id} className={`event ${ev.status}`}>
              <div className="event-date">{fmtDate(ev.eventDate)}</div>
              <h2>{ev.title}</h2>
              {ev.summary && ev.summary !== ev.title && <div className="summary">{ev.summary}</div>}
              <div className="scores">
                <span className="badge">{ev.sourceCount} source(s)</span>
                <span className="badge">sig {ev.significanceScore}</span>
              </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}