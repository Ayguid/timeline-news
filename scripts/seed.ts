// ============================================================================
// seed.ts — provision a demo user, the 'rss' adapter row, and starter
// news feeds. Run once against a fresh DB, or use --reset to wipe first.
// Usage: npx tsx scripts/seed.ts [--reset]
// ============================================================================
import { sql } from '../src/lib/db';

const reset = process.argv.includes('--reset');
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@timeline.news';

// reusable per-source id
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// v1 starter feeds. Multi-source by default (soul.md #2): the demo user gets
// several English RSS-native outlets plus a Spanish one, to exercise the
// multi-language scoring path. User can add their own via the UI later.
const STARTER_FEEDS = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', region: 'global', lang: 'en' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', region: 'global', lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', region: 'global', lang: 'en' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', region: 'us', lang: 'en' },
  { name: 'El País Internacional', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', region: 'es', lang: 'es' },
];

async function main() {
  try {
    if (reset) {
      console.log('[seed] resetting...');
      await sql`
        DELETE FROM event_articles;
        DELETE FROM events;
        DELETE FROM raw_articles;
        DELETE FROM sources;
        DELETE FROM verification_tokens;
        DELETE FROM accounts;
        DELETE FROM sessions;
        DELETE FROM users;
      `;
      console.log('[seed] reset done');
    }

    // adapter type row (the code seam)
    await sql`
      INSERT INTO source_adapters (id, name, adapter_type, description)
      VALUES (${newId('adap')}, 'Generic RSS/Atom feed', 'rss',
              'Ingests any user-added RSS/Atom feed URL.')
      ON CONFLICT (adapter_type) DO NOTHING
    `;

    // demo user (id stable so pipelines can attach events)
    await sql`
      INSERT INTO users (id, name, email)
      VALUES ('user_demo', 'Demo User', ${DEMO_EMAIL})
      ON CONFLICT (email) DO NOTHING
    `;

    // starter feeds
    for (const f of STARTER_FEEDS) {
      await sql`
        INSERT INTO sources (id, user_id, name, feed_url, adapter_type, lang, region, active)
        VALUES (${newId('src')}, 'user_demo', ${f.name}, ${f.url}, 'rss', ${f.lang}, ${f.region}, true)
        ON CONFLICT (user_id, feed_url) DO NOTHING
      `;
    }

    const n = await sql`SELECT count(*)::int AS n FROM sources WHERE user_id = 'user_demo'`;
    console.log(`[seed] demo user + ${n[0].n} starter source(s) ready.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});