-- News Timeline — migration 0004
-- 1. events.distinct_sources — the REAL number of distinct outlets covering an
--    event (source_count currently stores the WEIGHTED corroboration score,
--    which is what the timeline badge should NOT show).
-- 2. Per-topic default-significance control. We replace the all-or-none
--    boolean (user_topic_settings) with a per-token disable list:
--    user_disabled_default_topics(user_id, lang, token) = built-in defaults the
--    user has switched off. Absence of a row = that default stays on.

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS distinct_sources INTEGER NOT NULL DEFAULT 0;

-- Per-topic default deactivation. Only rows the user deliberately turned OFF.
CREATE TABLE IF NOT EXISTS user_disabled_default_topics (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang    TEXT NOT NULL DEFAULT 'en',
  token   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lang, token)
);

-- The old all-or-none toggle is replaced per-topic; drop it if present.
DROP TABLE IF EXISTS user_topic_settings;

COMMIT;