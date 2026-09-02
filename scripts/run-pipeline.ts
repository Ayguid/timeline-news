// ============================================================================
// run-pipeline.ts — end-to-end ingestion for the current user's sources.
//   ingest (adapter -> raw_articles) -> cluster -> score -> persist
// Runs in GitHub Actions cron. For the v1 demo it processes ALL users and
// their active sources. Core logic lives in src/lib/pipeline.ts so the
// ON-DEMAND refresh path (/api/sources/[id]/refresh) reuses it.
// Usage: npx tsx scripts/run-pipeline.ts [--dry-run]
// ============================================================================
import { sql } from '../src/lib/db';
import {
  fetchAndInsertSource,
  loadTopicPreload,
  clusterScopePersist,
  mapLimit,
  FETCH_CONCURRENCY,
  type SourceRow,
} from '../src/lib/pipeline';

const dryRun = process.argv.includes('--dry-run');

async function ingestAll(): Promise<void> {
  const sources = (await sql`
    SELECT id, name, feed_url, adapter_type, owner_id
    FROM sources s
    WHERE s.active = true
  `) as unknown as SourceRow[];

  console.log(`[ingest] ${sources.length} active source(s)`);
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  const batches = await mapLimit(sources, FETCH_CONCURRENCY, async (src) => {
    return { src, ...(await fetchAndInsertSource(src)) };
  });

  for (const { src, inserted: ins, skipped: sk, error } of batches) {
    if (error) {
      console.error(`  ! ${src.name}: fetch error — ${error}`);
      failed++;
      continue;
    }
    inserted += ins;
    skipped += sk;
  }
  console.log(`[ingest] inserted=${inserted} skipped_dupes=${skipped} failed=${failed}`);
}

async function clusterAndScore(): Promise<void> {
  const preload = await loadTopicPreload();

  // 1) GLOBAL scope — shared events (scored with default topics).
  await clusterScopePersist({ userId: null, label: 'global' }, preload);

  // 2) PERSONAL scope — per user who owns an active source.
  const owners = await sql`SELECT DISTINCT owner_id AS owner_id FROM sources WHERE owner_id IS NOT NULL AND active = true`;
  for (const owner of owners) {
    await clusterScopePersist({ userId: owner.owner_id, label: `personal:${owner.owner_id}` }, preload);
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