-- News Timeline — migration 0006
-- Reconcile legacy sources.user_id with the two-tier owner_id model.
--
-- 0005 added sources.owner_id (NULL=global, <uid>=personal) but left the old
-- NOT NULL sources.user_id in place. Clean up:
--   1. Existing admin-curated starter feeds -> GLOBAL (owner_id NULL).
--   2. Any remaining user-owned row -> folded into owner_id.
--   3. Drop the legacy user_id column; owner_id is the single ownership field.

BEGIN;

-- Convert the 5 seeded global starter feeds (they are admin-curated).
-- Insert all users' preferences for these global sources (enabled by default)
-- so the demo user gets a timeline again after the reshape.
DO $$
DECLARE gid TEXT;
BEGIN
  FOR gid IN
    SELECT s.id FROM sources s
    WHERE s.feed_url IN (
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.theguardian.com/world/rss',
      'https://www.aljazeera.com/xml/rss/all.xml',
      'https://feeds.npr.org/1001/rss.xml',
      'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'
    )
  LOOP
    UPDATE sources SET owner_id = NULL WHERE id = gid;
    INSERT INTO user_sources (user_id, source_id, enabled)
    SELECT id, gid, true FROM users
    ON CONFLICT (user_id, source_id) DO NOTHING;
  END LOOP;
END $$;

-- Any other source is PERSONAL to its legacy owner.
UPDATE sources SET owner_id = user_id WHERE owner_id IS NULL AND user_id IS NOT NULL;

-- owner_id is the single ownership column now.
ALTER TABLE sources DROP COLUMN IF EXISTS user_id;

COMMIT;