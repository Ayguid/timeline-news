-- News Timeline — migration 0003
-- Per-user, per-language control over whether the BUILT-IN default significance
-- topics apply. A user may prefer to rely only on their own tokens, or none at
-- all. When defaults_enabled is false for a (user, lang), scoring uses ONLY the
-- user's own tokens for that language (effective = user only, not defaults ∪ user).

BEGIN;

CREATE TABLE IF NOT EXISTS user_topic_settings (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang             TEXT NOT NULL DEFAULT 'en',
  defaults_enabled BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, lang)
);

COMMIT;