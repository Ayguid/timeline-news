// ============================================================================
// topics.seed.ts — the default (GLOBAL) significance topics, per language.
//
// Managed by admins at runtime (see /api/topics *global* scope). This file is
// the idempotent SEED source of truth applied by `scripts/seed.ts` on fresh OR
// existing DBs (INSERT ... ON CONFLICT DO NOTHING). It lives OUTSIDE migrations
// so editing the default topic list is a code change, not a schema migration.
//
// A user's effective topics = significant_topics(lang) [global defaults]
//                           UNION user_topic_tokens(lang) [their own]
// where a saved row in user_disabled_default_topics turns one default off.
// ============================================================================

export interface SeedTopic {
  lang: 'en' | 'es';
  token: string; // lowercase keyword, e.g. 'election'
}

export const DEFAULT_TOPICS: SeedTopic[] = [
  // --- English ---
  { lang: 'en', token: 'election' },
  { lang: 'en', token: 'president' },
  { lang: 'en', token: 'war' },
  { lang: 'en', token: 'ceasefire' },
  { lang: 'en', token: 'invasion' },
  { lang: 'en', token: 'attack' },
  { lang: 'en', token: 'strike' },
  { lang: 'en', token: 'earthquake' },
  { lang: 'en', token: 'flood' },
  { lang: 'en', token: 'hurricane' },
  { lang: 'en', token: 'wildfire' },
  { lang: 'en', token: 'pandemic' },
  { lang: 'en', token: 'outbreak' },
  { lang: 'en', token: 'collapse' },
  { lang: 'en', token: 'market' },
  { lang: 'en', token: 'inflation' },
  { lang: 'en', token: 'rate' },
  { lang: 'en', token: 'central' },
  { lang: 'en', token: 'federal' },
  { lang: 'en', token: 'nuclear' },
  { lang: 'en', token: 'climate' },
  { lang: 'en', token: 'supreme' },
  { lang: 'en', token: 'court' },
  { lang: 'en', token: 'parliament' },
  { lang: 'en', token: 'government' },
  { lang: 'en', token: 'assassination' },
  { lang: 'en', token: 'coup' },
  { lang: 'en', token: 'treaty' },
  { lang: 'en', token: 'sanctions' },
  { lang: 'en', token: 'hostage' },
  { lang: 'en', token: 'cease-fire' },
  { lang: 'en', token: 'bank' },
  // --- Spanish ---
  { lang: 'es', token: 'eleccion' },
  { lang: 'es', token: 'presidente' },
  { lang: 'es', token: 'guerra' },
  { lang: 'es', token: 'alto' },
  { lang: 'es', token: 'invas' },
  { lang: 'es', token: 'ataque' },
  { lang: 'es', token: 'terremoto' },
  { lang: 'es', token: 'inundacion' },
  { lang: 'es', token: 'huracan' },
  { lang: 'es', token: 'incendio' },
  { lang: 'es', token: 'pandemia' },
  { lang: 'es', token: 'brote' },
  { lang: 'es', token: 'colapso' },
  { lang: 'es', token: 'inflacion' },
  { lang: 'es', token: 'banco' },
  { lang: 'es', token: 'central' },
  { lang: 'es', token: 'nuclear' },
  { lang: 'es', token: 'clima' },
  { lang: 'es', token: 'gobierno' },
  { lang: 'es', token: 'parlamento' },
  { lang: 'es', token: 'golpe' },
  { lang: 'es', token: 'tratado' },
  { lang: 'es', token: 'sanciones' },
  { lang: 'es', token: 'rehen' },
];