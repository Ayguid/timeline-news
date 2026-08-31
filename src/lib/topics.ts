// ============================================================================
// topics.ts — fetch a user's effective significance tokens, per language.
//   effective(lang) = significant_topics defaults(lang)
//                   UNION  user_topic_tokens(lang)
// This is the seam behind "user can edit & modify SIGNIFICANT_TOPIC_TOKENS".
// ============================================================================
import { sql } from './db';

export interface LanguageTopics {
  lang: string;
  /** combined default + user tokens */
  tokens: string[];
  /** just the user-added ones (so the UI can show/edit them) */
  userTokens: string[];
}

/** All languages a user has active sources in. */
export async function userLanguages(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT lang FROM sources WHERE user_id = ${userId} AND active = true
  `;
  return rows.map((r) => r.lang);
}

/** Effective significance tokens for a single language for a user. */
export async function effectiveTokens(
  userId: string,
  lang: string,
): Promise<LanguageTopics> {
  const [defaults, overrides] = await Promise.all([
    sql`SELECT token FROM significant_topics WHERE lang = ${lang}`,
    sql`SELECT token FROM user_topic_tokens WHERE user_id = ${userId} AND lang = ${lang}`,
  ]);

  const defaultTokens = defaults.map((r) => r.token);
  const userTokens = overrides.map((r) => r.token);

  // union, dedup
  const combined = [...new Set([...defaultTokens, ...userTokens])];
  return { lang, tokens: combined, userTokens };
}

/** Effective tokens across ALL the user's languages (union). */
export async function allEffectiveTokens(userId: string): Promise<string[]> {
  const langs = await userLanguages(userId);
  const sets = await Promise.all(langs.map((l) => effectiveTokens(userId, l)));
  return [...new Set(sets.flatMap((s) => s.tokens))];
}