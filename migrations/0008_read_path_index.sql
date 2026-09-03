-- News Timeline — migration 0008
-- Read-path index for the timeline query.
--
-- The timeline read query joins events → event_articles → raw_articles, and
-- after the date window is pushed into the vis_ea CTE, Postgres drives off
-- idx_events_date (events.event_date). event_articles is reached BY event_id
-- (covered by its PK), and raw_articles is joined BY article_id.
--
-- raw_articles already has its PK on id, but the join from event_articles
-- uses article_id directly; while that's a PK lookup it's cheap. The real win
-- here: guarantee the article_id traversal doesn't fall back to a scan as the
-- archive grows. A dedicated index on the join column (already the PK) is
-- redundant today, so this migration is kept as a no-op placeholder IF the PK
-- is confirmed present — see the guard below.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'event_articles'
      AND indexdef ILIKE '%(article_id)%' AND indexdef NOT ILIKE '%CREATE UNIQUE%event_id, article_id%'
  ) THEN
    -- composite/article lookup for the read path if ever needed
    CREATE INDEX IF NOT EXISTS idx_event_articles_article ON event_articles (article_id);
  END IF;
END $$;

COMMIT;