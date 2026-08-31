-- News Timeline — migration 0002
-- Multi-language scoring + user-editable significance topics.
--
-- rationale:
--  * users may read news in several languages (e.g. en + es); the significance
--    token list must therefore be per-language. We keep a SHARED default list
--    per language in `significant_topics`, and a per-user OVERRIDE table so
--    each user can tune what counts as "important" for themselves.

BEGIN;

-- Shared (built-in) significance tokens, one row per (lang, token).
-- Seeded for en/es in v1. This replaces the hardcoded EN array in score.ts.
CREATE TABLE IF NOT EXISTS significant_topics (
  id      TEXT PRIMARY KEY,
  lang    TEXT NOT NULL,
  token   TEXT NOT NULL,          -- lowercase keyword, e.g. 'election'
  UNIQUE (lang, token)
);
CREATE INDEX IF NOT EXISTS idx_significant_topics_lang ON significant_topics (lang);

-- Per-user override: tokens the user added (weight 1 each), their own language.
-- A user's effective topic list = default(lang) UNION user_topic_tokens(lang).
CREATE TABLE IF NOT EXISTS user_topic_tokens (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang    TEXT NOT NULL DEFAULT 'en',
  token   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lang, token)
);
CREATE INDEX IF NOT EXISTS idx_user_topics ON user_topic_tokens (user_id, lang);

-- Seed the shared defaults for supported launch languages.
-- Covers the previous hardcoded EN tokens; adds a Spanish set.
INSERT INTO significant_topics (id, lang, token) VALUES
  ('t_en_01','en','election'), ('t_en_02','en','president'),
  ('t_en_03','en','war'), ('t_en_04','en','ceasefire'), ('t_en_05','en','invasion'),
  ('t_en_06','en','attack'), ('t_en_07','en','strike'), ('t_en_08','en','earthquake'),
  ('t_en_09','en','flood'), ('t_en_10','en','hurricane'), ('t_en_11','en','wildfire'),
  ('t_en_12','en','pandemic'), ('t_en_13','en','outbreak'), ('t_en_14','en','collapse'),
  ('t_en_15','en','market'), ('t_en_16','en','inflation'), ('t_en_17','en','rate'),
  ('t_en_18','en','central'), ('t_en_19','en','federal'), ('t_en_20','en','nuclear'),
  ('t_en_21','en','climate'), ('t_en_22','en','supreme'), ('t_en_23','en','court'),
  ('t_en_24','en','parliament'), ('t_en_25','en','government'), ('t_en_26','en','assassination'),
  ('t_en_27','en','coup'), ('t_en_28','en','treaty'), ('t_en_29','en','sanctions'),
  ('t_en_30','en','hostage'), ('t_en_31','en','cease-fire'), ('t_en_32','en','bank'),
  ('t_es_01','es','eleccion'), ('t_es_02','es','presidente'), ('t_es_03','es','guerra'),
  ('t_es_04','es','alto'), ('t_es_05','es','invas'), ('t_es_06','es','ataque'),
  ('t_es_07','es','terremoto'), ('t_es_08','es','inundacion'), ('t_es_09','es','huracan'),
  ('t_es_10','es','incendio'), ('t_es_11','es','pandemia'), ('t_es_12','es','brote'),
  ('t_es_13','es','colapso'), ('t_es_14','es','inflacion'), ('t_es_15','es','banco'),
  ('t_es_16','es','central'), ('t_es_17','es','nuclear'), ('t_es_18','es','clima'),
  ('t_es_19','es','gobierno'), ('t_es_20','es','parlamento'), ('t_es_21','es','golpe'),
  ('t_es_22','es','tratado'), ('t_es_23','es','sanciones'), ('t_es_24','es','rehen')
ON CONFLICT (lang, token) DO NOTHING;

COMMIT;