// Live smoke test for the HTML adapter (no DB needed).
// Usage: npx tsx scripts/smoke-html.ts
import { htmlAdapter } from '../src/lib/adapters/html';
import { listAdapters } from '../src/lib/adapters';

async function main() {
  console.log('registered adapters:', listAdapters().map((a) => a.id).join(', '));

  for (const u of ['https://www.bbc.com/news', 'https://www.theguardian.com/world']) {
    const res = await htmlAdapter.fetch({ url: u, limit: 10 });
    if (res.error) {
      console.log(`\n[${u}] ERROR: ${res.error.message}`);
      continue;
    }
    console.log(`\n[${u}] ${res.articles.length} articles`);
    for (const a of res.articles.slice(0, 5)) console.log('   -', a.title.slice(0, 70));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });