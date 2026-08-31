// ============================================================================
// run-pipeline.ts — end-to-end ingestion for the current user's sources.
//   ingest (adapter -> raw_articles) -> cluster -> score -> persist
// Runs in GitHub Actions cron. For the v1 demo it processes ALL users and
// their active sources.
// Usage: npx tsx scripts/run-pipeline.ts [--dry-run]
// ============================================================================
import { sql } from '../src/lib/db';
import { getAdapter } from '../src/lib/adapters';
import { clusterArticles } from '../src/lib/cluster';
import { scoreEvent, THRESHOLDS } from '../src/lib/score';
import { effectiveTokens } from '../src/lib/topics';
import { createHash } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');

function hashTitle(title: string): string {
  return createHash('sha256')
    .update(title.trim().toLowerCase().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 24);
}

// Unique id: timestamp + random. Same shape as the API/seed helpers.
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ingestAll(): Promise<void> {
  // active sources across all users, joined to adapter type
  const sources = await sql`
    SELECT s.id, s.name, s.feed_url, s.adapter_type, s.user_id
    FROM sources s
    WHERE s.active = true
  `;

  console.log(`[ingest] ${sources.length} active source(s)`);
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const src of sources) {
    let adapter;
    try {
      adapter = getAdapter(src.adapter_type);
    } catch (e) {
      console.error(`  ! skip ${src.name}: ${(e as Error).message}`);
      failed++;
      continue;
    }

    const result = await adapter.fetch({ url: src.feed_url, limit: 30 });
    if (result.error) {
      console.error(`  ! ${src.name}: fetch error — ${result.error.message}`);
      failed++;
      continue;
    }

    for (const art of result.articles) {
      // upsert by unique url — the dedup backstop
      const existing = await sql`
        SELECT id FROM raw_articles WHERE url = ${art.url}
      `;
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const id = newId('art');
      await sql`
        INSERT INTO raw_articles (id, source_id, url, title, title_hash, summary_excerpt, published_at)
        VALUES (${id}, ${src.id}, ${art.url}, ${art.title}, ${hashTitle(art.title)}, ${art.summaryExcerpt}, ${art.publishedAt})
      `;
      inserted++;
    }
  }

  console.log(`[ingest] inserted=${inserted} skipped_dupes=${skipped} failed=${failed}`);
}

async function clusterAndScore(): Promise<void> {
  // fresh articles (last 72h) that aren't yet attached to an event
  const articles = await sql`
    SELECT a.id, a.source_id AS "sourceId", a.url, a.title, a.published_at AS "publishedAt",
           s.lang AS lang
    FROM raw_articles a
    JOIN sources s ON s.id = a.source_id
    LEFT JOIN event_articles ea ON ea.article_id = a.id
    WHERE ea.article_id IS NULL
      AND a.published_at > now() - interval '72 hours'
  `;

  if (articles.length === 0) {
    console.log('[cluster] no un-clustered fresh articles');
    return;
  }

  const candidates = clusterArticles(articles.map((a) => ({
    id: a.id,
    sourceId: a.sourceId,
    url: a.url,
    title: a.title,
    publishedAt: new Date(a.publishedAt),
    lang: a.lang ?? undefined,
  })));

  console.log(`[cluster] ${articles.length} articles -> ${candidates.length} candidate event(s)`);

  let created = 0;
  for (const cand of candidates) {
    // User-specific, language-aware topic tokens (defaults UNION user override)
    const owner = await sql`
      SELECT s.user_id AS uid FROM raw_articles a JOIN sources s ON s.id = a.source_id
      WHERE a.id = ${cand.memberIds[0]}
    `;
    const userId = owner[0]?.uid ?? 'user_demo';

    const langTopics = await effectiveTokens(userId, cand.lang);
    const scored = scoreEvent({
      title: cand.title,
      summary: cand.summary,
      sourceCount: cand.sourceIds.length,
      tokens: langTopics.tokens,
    });

    if (scored.significanceScore < THRESHOLDS.propose) {
      console.log(`  - below bar (${scored.significanceScore}): ${cand.title.slice(0, 60)}`);
      continue;
    }

    const autoApproved = scored.significanceScore >= THRESHOLDS.autoApprove;
    const status = autoApproved ? 'approved' : 'proposed';
    const eventId = newId('evt');

    await sql`
      INSERT INTO events
        (id, user_id, title, summary, event_date, date_inferred, source_count,
         topic_match_score, significance_score, status, approval_source)
      VALUES
        (${eventId}, ${userId}, ${cand.title}, ${cand.summary},
         ${cand.eventDate}, true, ${scored.sourceCount}, ${scored.topicMatchScore},
         ${scored.significanceScore}, ${status}, 'auto')
      ON CONFLICT DO NOTHING
    `;

    // link members
    for (const artId of cand.memberIds) {
      await sql`
        INSERT INTO event_articles (event_id, article_id) VALUES (${eventId}, ${artId})
        ON CONFLICT DO NOTHING
      `;
    }

    console.log(`  + [${status}] (${scored.significanceScore}) ${cand.title.slice(0, 60)}`);
    created++;
  }
}

async function main() {
  try {
    console.log('=== timeline-news pipeline ===');
    if (dryRun) console.log('DRY RUN — no writes');
    await ingestAll();
    await clusterAndScore();
    console.log('=== done ===');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('pipeline failed:', e);
  process.exit(1);
});