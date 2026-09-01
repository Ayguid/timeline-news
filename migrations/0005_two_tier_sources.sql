-- News Timeline — migration 0005
-- Two-tier source model (shared + personal) for scale + personalization.
--
--  * sources.owner_id:
--      NULL  = GLOBAL source (admin-curated; scraped once for everyone)
--      <uid> = PERSONAL source (belongs to that user; scraped for them only)
--    UNIQUE(feed_url) is now GLOBAL (was per-(user_id,feed_url)) so the same
--    feed is never duplicated — the whole point of the shared model.
--
--  * user_sources: which GLOBAL sources a user has switched ON for their
--    timeline (a filter preference, NOT stored articles). Personal sources are
--    not listed here — the owner always sees theirs.
--
--  * events.user_id becomes NULLABLE:
--      NULL = GLOBAL event (built from admin/global feeds; shared, auto-approved)
--      <uid> = PERSONAL event (built from that user's own sources)
--
-- Status is GLOBAL for global events (auto-approve once); personal events are
-- approved for their owner by the same threshold.
--
-- NOTE: the per-user personal-source CAP is enforced in app code (pipeline +
-- API), not here — a DB generated column would be brittle and repetitive.

BEGIN;

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_user_id_feed_url_key;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
-- Global sources are shared; enforce one row per feed URL across everyone.
-- (NULL owner_id rows don't collide with each other in Postgres UNIQUE.)
ALTER TABLE sources ADD CONSTRAINT sources_feed_url_key UNIQUE (feed_url);

ALTER TABLE events ALTER COLUMN user_id DROP NOT NULL;

-- User's selection of which global sources appear in their timeline.
CREATE TABLE IF NOT EXISTS user_sources (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  enabled   BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_id)
);

COMMIT;