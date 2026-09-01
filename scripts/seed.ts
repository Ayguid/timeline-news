// ============================================================================
// seed.ts — provision the demo (admin) user, adapter rows, and the GLOBAL
// starter feeds, and enable them for the demo user (migration 0005 two-tier).
// Usage: npx tsx scripts/seed.ts [--reset]
// ============================================================================
import { sql } from '../src/lib/db';

const reset = process.argv.includes('--reset');
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@timeline.news';

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// v1 GLOBAL starter feeds (admin-curated, owner_id NULL = shared).
const STARTER_FEEDS = [
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', region: 'global', lang: 'en' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', region: 'global', lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', region: 'global', lang: 'en' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', region: 'us', lang: 'en' },
  { name: 'El País Internacional', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', region: 'es', lang: 'es' },
];

const ADAPTER_ROWS = [
  { id: newId('adap'), name: 'Generic RSS/Atom feed', type: 'rss', desc: 'Ingests any RSS/Atom feed URL.' },
  { id: newId('adap'), name: 'Generic HTML page (no RSS)', type: 'html', desc: 'Scrapes headlines when no RSS exists (respects robots.txt).' },
];

async function main() {
  try {
    if (reset) {
      console.log('[seed] resetting...');
      await sql`
        DELETE FROM event_articles;
        DELETE FROM events;
        DELETE FROM raw_articles;
        DELETE FROM user_sources;
        DELETE FROM sources;
        DELETE FROM verification_tokens;
        DELETE FROM accounts;
        DELETE FROM sessions;
        DELETE FROM users;
      `;
      console.log('[seed] reset done');
    }

    // adapter type rows (code seam)
    for (const a of ADAPTER_ROWS) {
      await sql`
        INSERT INTO source_adapters (id, name, adapter_type, description)
        VALUES (${a.id}, ${a.name}, ${a.type}, ${a.desc})
        ON CONFLICT (adapter_type) DO NOTHING
      `;
    }

    // demo user (normal role — admin is decided by ADMIN_EMAILS env, not seed)
    await sql`
      INSERT INTO users (id, name, email)
      VALUES ('user_demo', 'Demo User', ${DEMO_EMAIL})
      ON CONFLICT (email) DO NOTHING
    `;

    // global starter feeds (owner_id NULL = shared across users)
    for (const f of STARTER_FEEDS) {
      await sql`
        INSERT INTO sources (id, name, feed_url, adapter_type, lang, region, active, owner_id)
        VALUES (${newId('src')}, ${f.name}, ${f.url}, 'rss', ${f.lang}, ${f.region}, true, NULL)
        ON CONFLICT (feed_url) DO NOTHING
      `;
    }

    // enable all global sources for the demo user (so they have a timeline)
    await sql`
      INSERT INTO user_sources (user_id, source_id, enabled)
      SELECT 'user_demo', id, true FROM sources WHERE owner_id IS NULL
      ON CONFLICT (user_id, source_id) DO NOTHING
    `;

    const n = await sql`SELECT count(*)::int AS n FROM sources WHERE owner_id IS NULL`;
    const enabled = await sql`SELECT count(*)::int AS n FROM user_sources WHERE user_id = 'user_demo' AND enabled = true`;
    console.log(`[seed] demo user + ${n[0].n} global source(s); ${enabled[0].n} enabled for demo. (Admin via ADMIN_EMAILS env, not seed.)`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});