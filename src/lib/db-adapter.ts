// ============================================================================
// db-adapter.ts — a minimal Auth.js Adapter backed by the raw `postgres`
// client (`sql`). Why not @auth/drizzle-adapter? It forces its own non-standard
// table/column naming (pgTable("user"), camelCase cols) which contradicts the
// clean snake_case schema in migrations/0001_init.sql. A small native adapter
// matches our schema exactly and avoids the type gymnastics.
//
// We only implement what the Email (magic-link) provider + database sessions
// actually call. See Auth.js Adapter interface for the full contract.
// ============================================================================
import type { Adapter, AdapterUser, AdapterSession, VerificationToken } from 'next-auth/adapters';
import { sql } from './db';

// Shape of a `users` row returned by the postgres driver (loose — field
// access is validated against the schema, not spelled out as a record).
type UserRow = Record<string, unknown>;

function rowToUser(r: UserRow): AdapterUser {
  return {
    id: String(r.id),
    name: typeof r.name === 'string' ? r.name : null,
    email: String(r.email),
    emailVerified: r.email_verified instanceof Date ? r.email_verified : null,
    image: typeof r.image === 'string' ? r.image : null,
  };
}

/** Generate the same id shape used elsewhere in the app. */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const authAdapter: Adapter = {
  async createUser(user) {
    console.log('[adapter:createUser] input =', JSON.stringify(user));
    const id = newId('usr');
    const rows = await sql`
      INSERT INTO users (id, name, email, email_verified, image)
      VALUES (${id}, ${user.name ?? null}, ${user.email},
              ${user.emailVerified ?? null}, ${user.image ?? null})
      RETURNING *
    `;
    return rowToUser(rows[0]);
  },

  async getUser(id) {
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    return rows.length ? rowToUser(rows[0]) : null;
  },

  async getUserByEmail(email) {
    const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
    return rows.length ? rowToUser(rows[0]) : null;
  },

  // OAuth: find the user already linked to a provider account (Google etc.)
  async getUserByAccount(account) {
    const rows = await sql`
      SELECT u.* FROM users u
      JOIN accounts a ON a.user_id = u.id
      WHERE a.provider = ${account.provider}
        AND a.provider_account_id = ${account.providerAccountId}
      LIMIT 1
    `;
    return rows.length ? rowToUser(rows[0]) : null;
  },

  // OAuth: link a provider account to an existing (or freshly created) user.
  async linkAccount(account) {
    const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? null : String(v));
    await sql`
      INSERT INTO accounts (user_id, type, provider, provider_account_id,
                             refresh_token, access_token, expires_at,
                             token_type, scope, id_token, session_state)
      VALUES (${account.userId}, ${account.type}, ${account.provider},
              ${account.providerAccountId}, ${str(account.refresh_token)},
              ${str(account.access_token)}, ${account.expires_at ?? null},
              ${str(account.token_type)}, ${str(account.scope)},
              ${str(account.id_token)}, ${str(account.session_state)})
      ON CONFLICT (provider, provider_account_id) DO NOTHING
    `;
  },

  async updateUser(user) {
    // CRITICAL: Auth.js calls updateUser({ id, emailVerified }) WITHOUT email
    // on every magic-link re-login (handle-login.js:68). Writing `user.email ?? ''`
    // would WIPE the stored email to an empty string — the root cause of the
    // empty-email users and the duplicate-key error that follows. Only update
    // fields that were actually provided.
    const sets: string[] = [];
    const params: (string | Date | null)[] = [user.id];
    if (user.name !== undefined) { params.push(user.name); sets.push(`name = $${params.length}`); }
    if (user.email !== undefined) { params.push(user.email); sets.push(`email = $${params.length}`); }
    if (user.emailVerified !== undefined) { params.push(user.emailVerified); sets.push(`email_verified = $${params.length}`); }
    if (user.image !== undefined) { params.push(user.image); sets.push(`image = $${params.length}`); }
    if (sets.length === 0) {
      // Nothing provided — re-read and return current row (avoids wiping data).
      const rows = await sql`SELECT * FROM users WHERE id = ${user.id}`;
      return rows.length ? rowToUser(rows[0]) : (user as unknown as AdapterUser);
    }
    const rows = await sql.unsafe(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return rowToUser(rows[0]);
  },

  async createSession(session) {
    await sql`
      INSERT INTO sessions (session_token, user_id, expires)
      VALUES (${session.sessionToken}, ${session.userId}, ${session.expires})
    `;
    return {
      sessionToken: session.sessionToken,
      userId: session.userId,
      expires: session.expires,
    } as AdapterSession;
  },

  async getSessionAndUser(sessionToken: string) {
    const rows = await sql`
      SELECT s.session_token, s.expires, u.*
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.session_token = ${sessionToken}
    `;
    if (!rows.length) return null;
    return {
      session: {
        sessionToken: rows[0].session_token,
        userId: rows[0].user_id,
        expires: rows[0].expires,
      } as AdapterSession,
      user: rowToUser(rows[0]),
    };
  },

  async updateSession(session) {
    if (!session.expires) throw new Error('updateSession requires expires');
    await sql`
      UPDATE sessions SET expires = ${session.expires}
      WHERE session_token = ${session.sessionToken}
    `;
    return session as AdapterSession;
  },

  async deleteSession(sessionToken: string) {
    await sql`DELETE FROM sessions WHERE session_token = ${sessionToken}`;
  },

  async createVerificationToken(token) {
    await sql`
      INSERT INTO verification_tokens (identifier, token, expires)
      VALUES (${token.identifier}, ${token.token}, ${token.expires})
    `;
    return token as VerificationToken;
  },

  async useVerificationToken(params) {
    const rows = await sql`
      DELETE FROM verification_tokens
      WHERE identifier = ${params.identifier} AND token = ${params.token}
      RETURNING *
    `;
    return rows.length
      ? { identifier: rows[0].identifier, token: rows[0].token, expires: rows[0].expires } as VerificationToken
      : null;
  },
};