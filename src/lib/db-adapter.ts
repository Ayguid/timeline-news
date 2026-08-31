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

function rowToUser(r: any): AdapterUser {
  return {
    id: r.id,
    name: r.name ?? null,
    email: r.email,
    emailVerified: r.email_verified ?? null,
    image: r.image ?? null,
  };
}

/** Generate the same id shape used elsewhere in the app. */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const authAdapter: Adapter = {
  async createUser(user) {
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
    const rows = await sql`
      UPDATE users SET
        name = ${user.name ?? null},
        email = ${user.email ?? ''},
        email_verified = ${user.emailVerified ?? null},
        image = ${user.image ?? null}
      WHERE id = ${user.id}
      RETURNING *
    `;
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