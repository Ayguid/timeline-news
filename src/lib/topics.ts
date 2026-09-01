// ============================================================================
// topics.ts — fetch a user's effective significance tokens, per language.
//   effective(lang) = significant_topics defaults(lang)   [if defaults_enabled]
//                   UNION user_topic_tokens(lang)
// defaults_enabled lives in user_topic_settings (migration 0003), so a user can
// switch off the built-in topics for a language and rely on their own (or none).
// ============================================================================
import { sql } from './db';

export interface LanguageTopicState {
  lang: string;
  defaultsEnabled: boolean;
  /** combined default + user tokens (respects defaultsEnabled) */
  tokens: string[];
  /** just the user-added ones (so the UI can show/edit them) */
  userTokens: string[];
  /** built-in tokens (for reference in the UI) */
  defaultTokens: string[];
}

/** All languages a user has active sources in. */
export async function userLanguages(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT lang FROM sources WHERE user_id = ${userId} AND active = true
  `;
  return rows.map((r) => r.lang);
}

/** Effective significance topic state for one language for a user. */
export async function topicState(userId: string, lang: string): Promise<LanguageTopicState> {
  const [defaults, overrides, setting] = await Promise.all([
    sql`SELECT token FROM significant_topics WHERE lang = ${lang}`,
    sql`SELECT token FROM user_topic_tokens WHERE user_id = ${userId} AND lang = ${lang}`,
    sql`SELECT defaults_enabled AS de FROM user_topic_settings WHERE user_id = ${userId} AND lang = ${lang}`,
  ]);

  const defaultTokens = defaults.map((r) => r.token);
  const userTokens = overrides.map((r) => r.token);
  // defaults_enabled defaults to true when no setting row exists.
  const defaultsEnabled = setting.length === 0 ? true : setting[0].de === true;

  const combined = defaultsEnabled
    ? [...new Set([...defaultTokens, ...userTokens])]
    : [...new Set(userTokens)];

  return { lang, defaultsEnabled, tokens: combined, userTokens, defaultTokens };
}

/** Effective tokens across ALL the user's languages (union). */
export async function allEffectiveTokens(userId: string): Promise<string[]> {
  const langs = await userLanguages(userId);
  const states = await Promise.all(langs.map((l) => topicState(userId, l)));
  return [...new Set(states.flatMap((s) => s.tokens))];
}