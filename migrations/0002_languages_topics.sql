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
-- The DEFAULT data is owned by data/topics.seed.ts and applied by
-- scripts/seed.ts (INSERT ... ON CONFLICT DO NOTHING) — NOT by this migration.
-- Admins can add/edit/remove global tokens at runtime (see /api/topics).
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

COMMIT;