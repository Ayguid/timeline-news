// ============================================================================
// /api/pipeline/run — admin-triggerable pipeline run (don't wait for the cron).
// Only admins may call it. Fires the GitHub Actions `ingest` workflow via
// `workflow_dispatch`. Requires GITHUB_TOKEN + GITHUB_REPO (owner/repo) env.
// Returns 501 "not configured" if no GitHub repo/token is set (e.g. local).
// The pipeline itself is the same as `npm run pipeline`.
// ============================================================================
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';

export async function POST() {
  const session = await currentUser();
  if (!session?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'admins only' }, { status: 403 });

  const repo = process.env.GITHUB_REPO; // e.g. "guido/timeline-news"
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    return NextResponse.json(
      { error: 'GitHub dispatch not configured (set GITHUB_REPO + GITHUB_TOKEN). Run `npm run pipeline` locally.' },
      { status: 501 },
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/ingest.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return NextResponse.json({ error: `GitHub dispatch failed (${res.status}): ${body.slice(0, 200)}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message: 'pipeline run dispatched' });
}