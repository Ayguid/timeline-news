-- News Timeline — initial schema (v1)
-- Multi-user: each user curates their own feed set.

BEGIN;

-- =====================================================================
-- users (auth)
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  email         TEXT NOT NULL UNIQUE,
  email_verified TIMESTAMPTZ,
  image         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- next-auth session/account plumbing (needed for email magic links)
CREATE TABLE IF NOT EXISTS sessions (
  session_token TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,
  provider           TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token      TEXT,
  access_token       TEXT,
  expires_at         BIGINT,
  token_type         TEXT,
  scope              TEXT,
  id_token           TEXT,
  session_state      TEXT,
  PRIMARY KEY (provider, provider_account_id)
);
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT PRIMARY KEY,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL
);

-- =====================================================================
-- source_adapters: the known ingest *types* (code seam, not user data)
-- e.g. 'rss' generic feed. Add HTML scraper adapters here later.
-- =====================================================================
CREATE TABLE IF NOT EXISTS source_adapters (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  adapter_type  TEXT NOT NULL UNIQUE,   -- matches SourceAdapter.id in code
  description   TEXT
);

-- =====================================================================
-- sources: actual feed instances a user subscribes to
-- =====================================================================
CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,           -- user-facing label
  feed_url      TEXT NOT NULL,           -- RSS URL (or seed URL for HTML adapter)
  adapter_type  TEXT NOT NULL REFERENCES source_adapters(adapter_type),
  lang          TEXT NOT NULL DEFAULT 'en',
  region        TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, feed_url)
);

-- =====================================================================
-- raw_articles: one row per ingested article. URL unique = dedup backstop.
-- summary_excerpt is SHORT & attribution-safe — never full text.
-- =====================================================================
CREATE TABLE IF NOT EXISTS raw_articles (
  id             TEXT PRIMARY KEY,
  source_id      TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url            TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  title_hash     TEXT NOT NULL,           -- normalized-title hash for near-dupe detect
  summary_excerpt TEXT,                    -- short excerpt, attribution-safe
  published_at   TIMESTAMPTZ NOT NULL,
  scraped_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_articles_published ON raw_articles (published_at DESC);

-- =====================================================================
-- events: clustered, scored timeline entries
-- =====================================================================
CREATE TABLE IF NOT EXISTS events (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  summary           TEXT,
  event_date        TIMESTAMPTZ NOT NULL,          -- ordered by this (chronological view)
  date_inferred     BOOLEAN NOT NULL DEFAULT true, -- true = from publish time, not verified event time
  source_count      INTEGER NOT NULL DEFAULT 0,     -- distinct sources citing this event
  topic_match_score INTEGER NOT NULL DEFAULT 0,     -- matched curated significant-topic list
  significance_score INTEGER NOT NULL DEFAULT 0,    -- derived: source_count + topic_match_score
  status            TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed','approved','rejected')),
  approval_source   TEXT NOT NULL DEFAULT 'auto'
                    CHECK (approval_source IN ('auto','manual')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date ASC);
CREATE INDEX IF NOT EXISTS idx_events_user_status ON events (user_id, status);

-- =====================================================================
-- event_articles: join — an event cites multiple articles
-- =====================================================================
CREATE TABLE IF NOT EXISTS event_articles (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES raw_articles(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, article_id)
);

COMMIT;