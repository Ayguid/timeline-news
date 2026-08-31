// ============================================================================
// db.ts — Postgres client (Neon serverless). Connects via the standard
// postgres driver. DATABASE_URL is a pooled Neon connection string.
// Shared by pipeline scripts (Node) and API routes (Next).
// ============================================================================
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env (see .env.example).');
}

// `prepare: false` avoids cached prepared statements across Neon/edge — safer
// for a serverless driver shared between scripts and routes.
export const sql = postgres(DATABASE_URL, {
  max: 10,
  prepare: false,
  ssl: 'require',
});

/** Quick liveness check — useful for CI / GitHub Actions sanity gate. */
export async function ping(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}