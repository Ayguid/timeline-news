// ============================================================================
// stats.ts — quick DB sanity read: article/event counts, per-source, per-lang.
// Usage: npx tsx scripts/stats.ts
// ============================================================================
import { sql } from '../src/lib/db';

async function main() {
  const articles = await sql`SELECT count(*)::int AS n FROM raw_articles`;
  const events = await sql`SELECT status, count(*)::int AS n FROM events GROUP BY status ORDER BY status`;
  const sources = await sql`SELECT s.name, count(a.id)::int AS n FROM sources s LEFT JOIN raw_articles a ON a.source_id=s.id GROUP BY s.name ORDER BY n DESC`;
  const langs = await sql`SELECT lang, count(*)::int AS n FROM sources GROUP BY lang`;

  console.log('raw_articles total:', articles[0].n);
  console.log('\nevents by status:');
  for (const e of events) console.log(`  ${e.status}: ${e.n}`);
  console.log('\narticles per source:');
  for (const s of sources) console.log(`  ${s.name}: ${s.n}`);
  console.log('\nsource langs:');
  for (const l of langs) console.log(`  ${l.lang}: ${l.n}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });