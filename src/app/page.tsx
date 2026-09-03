import { currentUser } from '@/lib/session';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/logout-button';
import TimelineFeed from '@/components/timeline-feed';

export const dynamic = 'force-dynamic';

export default async function TimelinePage() {
  const session = await currentUser();
  if (!session?.id) redirect('/auth/signin');

  return (
    <div className="wrap">
      <nav className="top">
        <span>{session.email ?? 'Demo'}</span>
        <Link href="/sources">Sources</Link>
        <LogoutButton />
      </nav>

      <div className="lockup">
        <h1>News Timeline</h1>
        <span className="tagline">chronological record · scroll to load more</span>
      </div>

      <TimelineFeed />
    </div>
  );
}