// ============================================================================
// apply-migrations.mjs — applies migrations/*.sql to the DB idempotently.
// Tracks applied files in a schema_migrations table. psql-free (works in
// GitHub Actions where psql isn't installed).
// ============================================================================
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

// max:1 — required so sql.unsafe can run multi-statement migrations
// (BEGIN/COMMIT + several statements on one connection).
const sql = postgres(DATABASE_URL, { ssl: 'require', max: 1 });

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const done = await sql`SELECT 1 FROM schema_migrations WHERE filename = ${file}`;
    if (done.length > 0) continue;
    console.log(`applying ${file}`);
    const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await sql.unsafe(body); // multi-statement SQL
    await sql`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    console.log(`  ok`);
  }
  console.log('migrations up to date');
}

main()
  .catch((e) => { console.error('migration failed:', e); process.exit(1); })
  .finally(() => sql.end());