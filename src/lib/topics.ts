// ============================================================================
// topics.ts — fetch a user's effective significance tokens, per language.
//   effective(lang) = defaults(lang) NOT disabled by the user
//                   ∪ user_topic_tokens(lang)
// Per-topic control (migration 0004): user_disabled_default_topics stores the
// built-in tokens the user switched OFF for a language. Absence = keep default.
// ============================================================================
import { sql } from './db';

export interface DefaultTopic {
  token: string;
  enabled: boolean; // true unless the user disabled it
}

export interface LanguageTopicState {
  lang: string;
  /** built-in tokens, each with its per-topic enabled flag (for the UI) */
  defaults: DefaultTopic[];
  /** just the user-added ones (so the UI can show/edit them) */
  userTokens: string[];
  /** effective scoring tokens (respects per-topic disable) */
  tokens: string[];
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
  const [defaults, overrides, disabled] = await Promise.all([
    sql`SELECT token FROM significant_topics WHERE lang = ${lang}`,
    sql`SELECT token FROM user_topic_tokens WHERE user_id = ${userId} AND lang = ${lang}`,
    sql`SELECT token FROM user_disabled_default_topics WHERE user_id = ${userId} AND lang = ${lang}`,
  ]);

  const userTokens = overrides.map((r) => r.token);
  const disabledSet = new Set(disabled.map((r) => r.token));

  const defaultsList: DefaultTopic[] = defaults.map((r) => ({
    token: r.token,
    enabled: !disabledSet.has(r.token),
  }));

  // effective = enabled defaults ∪ user tokens
  const tokens = [
    ...new Set([
      ...defaultsList.filter((d) => d.enabled).map((d) => d.token),
      ...userTokens,
    ]),
  ];

  return { lang, defaults: defaultsList, userTokens, tokens };
}

/** Effective tokens across ALL the user's languages (union). */
export async function allEffectiveTokens(userId: string): Promise<string[]> {
  const langs = await userLanguages(userId);
  const states = await Promise.all(langs.map((l) => topicState(userId, l)));
  return [...new Set(states.flatMap((s) => s.tokens))];
}