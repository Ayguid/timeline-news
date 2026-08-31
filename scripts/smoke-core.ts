// ============================================================================
// smoke-core.ts — exercises the product's hard part against LIVE feeds,
// WITHOUT a database. Proves the vertical-slice core works end to end:
//   real RSS adapter -> normalization -> clustering -> scoring.
//   (DB persistence is the only step omitted; it needs DATABASE_URL.)
// Usage: npx tsx scripts/smoke-core.ts
// ============================================================================
import { rssAdapter } from '../src/lib/adapters/rss';
import { clusterArticles } from '../src/lib/cluster';
import { scoreEvent, THRESHOLDS } from '../src/lib/score';

const FEEDS = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', lang: 'en' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', lang: 'en' },
  { name: 'El País Internacional', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', lang: 'es' },
];

// A small bilingual token set (defaults + a couple user-style additions).
const TOKENS = [
  // en defaults (subset) + user additions
  'election','president','war','ceasefire','invasion','attack','strike',
  'earthquake','flood','hurricane','wildfire','pandemic','outbreak','collapse',
  'market','inflation','rate','central','federal','nuclear','climate','court',
  'government','assassination','coup','treaty','sanctions','hostage','cease-fire','bank',
  // es defaults subset
  'eleccion','presidente','guerra','invas','ataque','terremoto','inflacion','gobierno','nuclear',
  // user additions
  'galaxy','ai','rocket',
];

async function main() {
  console.log('=== timeline-news core smoke test (live feeds, no DB) ===\n');

  // 1. ingest across sources
  const articles: Array<{ id: string; sourceId: string; url: string; title: string; publishedAt: Date; lang?: string }> = [];
  let fetchFailures = 0;

  for (const f of FEEDS) {
    const res = await rssAdapter.fetch({ url: f.url, limit: 25 });
    if (res.error) {
      console.log(`  ! ${f.name}: fetch error — ${res.error.message}`);
      fetchFailures++;
      continue;
    }
    console.log(`  [ingest] ${f.name}: ${res.articles.length} articles`);
    for (let i = 0; i < res.articles.length; i++) {
      const a = res.articles[i];
      articles.push({
        id: `${f.lang}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        sourceId: f.name,
        url: a.url,
        title: a.title,
        publishedAt: a.publishedAt,
        lang: f.lang,
      });
    }
  }

  console.log(`\n  total articles across sources: ${articles.length}`);
  if (fetchFailures > 0) console.log(`  (${fetchFailures} feed(s) unreachable — proceeding with the rest)`);

  // 2. cluster
  const candidates = clusterArticles(articles);
  console.log(`  [cluster] ${articles.length} articles -> ${candidates.length} candidate event(s)\n`);

  // 3. score + show those that cross the "significance bar"
  const surfaced = candidates
    .map((c) => ({ c, s: scoreEvent({ title: c.title, summary: c.summary, sourceCount: c.sourceIds.length, tokens: TOKENS }) }))
    .filter(({ s }) => s.significanceScore >= THRESHOLDS.propose)
    .sort((a, b) => a.c.eventDate.getTime() - b.c.eventDate.getTime());

  console.log(`  --- events above the significance bar (${THRESHOLDS.propose}) ---`);
  if (surfaced.length === 0) {
    console.log('  (none — feeds may have few overlapping headlines right now)');
  }
  for (const { c, s } of surfaced) {
    const date = c.eventDate.toISOString().slice(0, 16).replace('T', ' ');
    console.log(`\n  [${c.lang}] ${date}  sig=${s.significanceScore} (sources=${c.sourceIds.length} + topics=${s.topicMatchScore}) ${s.significanceScore >= THRESHOLDS.autoApprove ? '★AUTO-APPROVED' : ''}`);
    console.log(`    title: ${c.title.slice(0, 90)}`);
    console.log(`    sources: ${c.sourceIds.join(', ')}`);
  }

  // 4. multi-source corroboration check (soul.md #2)
  const corroborated = candidates.filter((c) => c.sourceIds.length >= 2);
  console.log(`\n  === corroboration: ${corroborated.length} event(s) covered by 2+ sources ===`);
  console.log('  (these are the events soul.md principle #2 wants on the timeline)');
}

main().catch((e) => { console.error('smoke failed:', e); process.exit(1); });