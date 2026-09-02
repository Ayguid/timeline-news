-- News Timeline — migration 0008
-- Persist each event's primary LANGUAGE so read-time topic filtering can match
-- the event against the correct per-language token set.
-- (Previously lang was only implicit via its sources; storing it makes the
-- timeline's topic filter deterministic and cheap.)

BEGIN;

ALTER TABLE events ADD COLUMN IF NOT EXISTS lang TEXT NOT NULL DEFAULT 'en';

-- Backfill from the majority language of each event's covering sources.
UPDATE events e SET lang = sub.lang
FROM (
  SELECT ea.event_id AS eid, (
    SELECT s.lang FROM event_articles ea2
    JOIN raw_articles a2 ON a2.id = ea2.article_id
    JOIN sources s ON s.id = a2.source_id
    WHERE ea2.event_id = ea.event_id
    GROUP BY s.lang ORDER BY count(*) DESC LIMIT 1
  ) AS lang
  FROM event_articles ea
  GROUP BY ea.event_id
) sub
WHERE sub.eid = e.id AND sub.lang IS NOT NULL;

COMMIT;