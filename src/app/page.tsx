import { sql } from '@/lib/db';
import { currentUser } from '@/lib/session';
import Link from 'next/link';
import { redirect } from 'next/navigation';

type TimelineEvent = {
  id: string;
  title: string;
  summary: string | null;
  eventDate: string;
  significanceScore: number;
  sourceCount: number | null;
  status: string;
  articles: Array<{
    articleUrl: string | null;
    title: string;
    sourceName: string;
    publishedAt: string;
  }>;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const session = await currentUser();
  if (!session?.id) redirect('/auth/signin');

  const rows = await sql`
    SELECT e.id, e.title, e.summary, e.event_date AS "eventDate",
           e.significance_score AS "significanceScore",
           e.source_count AS "sourceCount", e.status,
           COALESCE(
             json_agg(json_build_object(
               'articleUrl', a.url,
               'title', a.title,
               'sourceName', s.name,
               'publishedAt', a.published_at
             ) ORDER BY a.published_at ASC) FILTER (WHERE a.id IS NOT NULL),
             '[]'
           ) AS articles
    FROM events e
    JOIN event_articles ea ON ea.event_id = e.id
    JOIN raw_articles a ON a.id = ea.article_id
    JOIN sources s ON s.id = a.source_id
    WHERE e.user_id = ${session.id}
      AND e.status = 'approved'
    GROUP BY e.id
    ORDER BY e.event_date ASC
  `;
  const events = rows as unknown as TimelineEvent[];

  return (
    <div className="wrap">
      <nav className="top">
        <span>{session.email ?? 'Demo'}</span>
        <Link href="/sources">Sources</Link>
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