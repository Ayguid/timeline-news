# News Timeline

A chronological timeline of world events, multi-sourced. Scrapes newspapers and
feeds into a shared event store, clusters related coverage into distinct
events, scores them for significance, and renders one clean date-ordered
timeline per user — a **record**, not a feed.

> **North star:** read [`soul.md`](./soul.md) before changing scope, sourcing,
> or UX. It is the non-negotiable context for every decision here.

---

## If you're a fresh session (AI or human), start here

Quick bootstrap so you don't rediscover decisions that are already made:

1. **Read [`soul.md`](./soul.md)** — the non-negotiables (attribution, multiple
   sources, event-time ordering, visible bias).
2. **The defining decision:** SAVE-ALL / VIEW-FILTER. Every clustered story is
   persisted *permanently*; the timeline is filtered *at read time* by the
   user's CURRENT active topics × enabled sources. Do **not** regress to
   "bake topic-match into stored events at pipeline time" or "delete personal
   events on re-derive" — both were bugs we fixed.
3. **Schema/roles:** two-tier sources — `sources.owner_id` NULL = global
   (admin-curated), set = a user's personal source. Admin is `ADMIN_EMAILS`
   (env list), **not** seeded. Personal-source cap = 3.
4. **Files to open first:**
   - `src/lib/timeline.ts` — the read-time filter (getTimelineEvents)
   - `src/lib/pipeline.ts` — shared ingest+cluster core (`scripts/run-pipeline.ts` is the cron wrapper)
   - `src/lib/cluster.ts` — dedup/clustering (the hard problem; digest-title filter + time-window O(n²))
   - `src/lib/session.ts` — auth + admin role
   - `src/app/api/timeline/route.ts` — timeline endpoint
5. **Secrets live outside the repo** (`.env` gitignored): `DATABASE_URL`,
   `AUTH_SECRET`, `ADMIN_EMAILS`. GitHub Actions secrets mirror `DATABASE_URL`
   + `AUTH_SECRET`. Confirm the DB is reachable before assuming data exists.
6. **Verify:** `npm run lint`, `npm run typecheck`, `npm run build`, then
   `hermes verify --json`. Recent state via `git log --oneline -15`.

---

## Status — v1 (working)

**ingest → cluster → score → Postgres → API → timeline page.**

Implemented so far:
- [x] Schema & migrations (Postgres/Neon), applied idempotently by `npm run migrate`
- [x] `SourceAdapter` contract (the seam) + `rss` adapter + generic `html` scraper
      fallback (respects robots.txt; works for server-rendered outlets, degraded
      for JS-heavy ones which need a per-source adapter)
- [x] **Two-tier sources** (the scale model): a shared **global registry**
      (admin-curated, scraped once) + optional **personal sources** per user
      (capped at **3**). Users pick which global sources they want via
      `user_sources` — a filter preference, never a copy of the news.
- [x] **SAVE-ALL / VIEW-FILTER** (the core model): every clustered story is
      persisted permanently. Which events a user SEES is decided at **read
      time** by their *current* topics × enabled sources. So toggling a topic
      or source changes the timeline immediately, no re-scrape, no news lost.
- [x] Clustering heuristic — 2 passes: token-overlap grouping, then fragment
      merge on df-weighted RARE tokens (proper nouns), so unrelated stories
      sharing common words (police/sydney) are NOT fused. Multi-topic digest /
      roundup headlines are excluded up front (they'd falsely bridge events).
- [x] Significance scoring (source corroboration + per-language curated topics)
- [x] Multi-language significance topics (en/es) with **per-topic** activation
- [x] NextAuth auth: Google OAuth / email magic link. Admin = explicit
      `ADMIN_EMAILS` env list (no silent admin). Dev-only demo login in dev.
- [x] Admin "Run now" pipeline trigger (`/api/pipeline/run`, GitHub dispatch)
- [x] **On-demand source refresh** (`/api/sources/[id]/refresh`): enabling a
      source with no fresh stored data triggers an immediate fetch + cluster +
      persist (freshness-gated, so it only hits the network when needed).
- [x] **Differential framing**: multi-source events show each outlet's own
      headline side-by-side ("How each outlet framed it").
- [x] Optimistic UI toggles (no flash-back / double-tap window on topic/source
      toggles).
- [x] API routes: `sources`, `sources/[id]`, `sources/[id]/refresh`, `timeline`,
      `topics`, `topics/settings`, `pipeline/run`
- [x] Timeline page (chronological) + Sources page + topics editor
- [x] GitHub Actions cron ingestion (`ingest.yml`, every 3h)
- [x] Scale-safe pipeline: parallel fetch (concurrency-capped 8) + batched
      inserts + bulk-preloaded scoring; core lives in `src/lib/pipeline.ts`
      shared by the cron and the on-demand refresh path.

Planned / deferred:
- [ ] Manual approve/reject toggle on events (soul.md hybrid review)
- [ ] Better clustering (embeddings) behind the same seam
- [ ] More languages' default topic lists (beyond en/es)
- [ ] Catch-up / storyline view (aggregate related events across days)
- [ ] True event-time inference (currently publish time as `event_date`)

---

## The architecture: save all the news, filter the view

This is the most important decision and the thing to understand if you restart
the project. **We persist every clustered story once; personalisation is a
view-time filter, not a rewrite of stored data.**

```
sources.owner_id  NULL = GLOBAL source (admin-curated, scraped once)
                  <uid> = PERSONAL source (that user's own; capped at 3)

events.user_id    NULL = GLOBAL event (built from global feeds, shared)
                  <uid> = PERSONAL event (built from that user's own feeds)

user_sources      (user_id, source_id, enabled) — which global sources a user
                  has switched on for their timeline.

Timeline (per user) = stored events from enabled sources ∪ that user's
                     personal events, FILTERED by the user's CURRENT topics.
```

**The two files that implement the product model:**

- `src/lib/pipeline.ts` — RECORDING: fetch a source → batch-insert articles →
  cluster → persist events. Keeps *every* clustered story (no topic gating at
  write time — topics are a view concern). Shared by the cron
  (`scripts/run-pipeline.ts`) and the on-demand refresh route.
- `src/lib/timeline.ts` — READING: `getTimelineEvents()` selects stored events
  and filters at read time by the user's *current* topics. Because tokens are
  read live, toggling a topic/source changes the timeline immediately with no
  re-scrape and no data loss.

**Why this matters (avoid the past bug):** the old model baked `topic_match`
into stored events at pipeline time and even deleted personal events on
re-derive — so toggling a topic didn't react until cron, and re-enabling
couldn't bring data back. The fix (your call) is store-everything +
filter-on-read.

**Topic model per language:** effective tokens = built-in defaults ∪ user
overrides, minus per-topic-disabled defaults (`user_disabled_default_topics`),
resolved live per request.

**Enough-news bar at read time:** corroborated multi-source events
(`distinct_sources >= 2`) always show; single-source events show only if they
match the user's current topics. So "significance" for a stored event is judged
now, against your present interests.

---

## Feature flags & how things wire together

| Concern | File | Notes |
| --- | --- | --- |
| Adapter contract + registry | `src/lib/adapters/index.ts` | Add adapters here |
| Generic RSS adapter | `src/lib/adapters/rss.ts` | Any feed URL |
| Generic HTML scraper | `src/lib/adapters/html.ts` | robots.txt-aware fallback |
| Clustering | `src/lib/cluster.ts` | The product's hard part |
| Scoring | `src/lib/score.ts` | Thresholds live here |
| Read-time timeline | `src/lib/timeline.ts` | SAVE-ALL/VIEW-FILTER core |
| Pipeline core | `src/lib/pipeline.ts` | fetch→insert→cluster→persist; shared |
| Topics (DB) | `src/lib/topics.ts` | defaults ∪ per-topic user toggles |
| Auth + roles | `src/lib/session.ts`, `src/auth.ts` | admin/user |
| Pipeline entry (GH Actions) | `scripts/run-pipeline.ts` | two-tier ingest→cluster→score |
| Seed | `scripts/seed.ts` | demo user + global sources + topics |

---

## Local development

Prereqs: Node 22+, a Postgres/Neon DB.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, EMAIL_SERVER
npm run migrate             # apply migrations/ (idempotent)
npm run seed                # demo user + global starter feeds + topics
npm run pipeline            # fetch → cluster → score → persist
npm run dev                 # http://localhost:3000
```

One-off run without writing: `npm run pipeline:dry`.

The seeded demo user has all global sources enabled, so the timeline is
populated out of the box.

### Authentication & roles — READ THIS (changed recently)

- **Google OAuth:** https://console.cloud.google.com/apis/credentials → OAuth
  client (Web app). Redirect URI `https://<domain>/api/auth/callback/google`
  (or `http://localhost:3000/...` locally). Set `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_AUTH_GOOGLE_ID`.
- **Email magic link:** set `EMAIL_SERVER` (SMTP/resend/brevo) + `EMAIL_FROM`.
- **Admin is an explicit env list, not a seeded flag** (`src/lib/session.ts`):
  a user is `admin` iff their email is in `ADMIN_EMAILS` (comma-separated). **No
  user is admin by default** — no silent admin. Admins curate global sources
  and can run the pipeline; regular users enable global sources, add up to 3
  personal ones, and edit their topics.
- The `users.role` column exists for schema completeness but is NOT the source
  of truth; `ADMIN_EMAILS` decides at runtime.
- Dev-only demo login (`/auth/signin` → "Demo login") maps to the seeded demo
  user and is NODE_ENV=development-only. To act as admin in dev, set
  `ADMIN_EMAILS=demo@timeline.news` in `.env`.

### Refreshing news

- **Steady state:** GitHub Actions cron runs `ingest.yml` every 3h.
- **On-demand:** enabling a source fires `POST /api/sources/[id]/refresh`,
  which fetches + clusters + persists that source immediately (the route is a
  no-op if stored data is already fresh — it only hits the network when there's
  a coverage gap).
- **Admin manual:** `POST /api/pipeline/run` fires `ingest.yml` via GitHub
  `workflow_dispatch` (needs `GITHUB_REPO` + `GITHUB_TOKEN`; returns 501
  locally).

---

## Data model (current)

- `sources` (global `owner_id NULL` + personal `owner_id = user`, feed_url
  unique globally), `raw_articles` (URL-unique dedup), `events`
  (`user_id NULL` = global, or = owner; `proposed`/`approved`/`rejected`;
  carries `lang`, `distinct_sources`, `source_count` = weighted score),
  `event_articles` join, `user_sources` (enabled global sources per user)
- `significant_topics` (shared per-language defaults) + `user_topic_tokens`
  (per-user overrides) + `user_disabled_default_topics` (per-topic toggle)
- Auth tables: `users`, `sessions`, `accounts`, `verification_tokens`

## Notes / decisions

- **Attribution over reproduction** (soul.md #1): we store a short excerpt +
  link, never full article text.
- **Chronological by event date** (soul.md #3): publish time as `event_date`
  with `date_inferred=true`; true event-time inference is deferred.
- **Multi-source corroboration** (soul.md #2) is the top scoring input, and
  such events are always shown regardless of topics.
- **Visible bias** (soul.md #4): the differential-framing view shows each
  outlet's own headline, so disagreement is visible rather than laundered.
- **Save-all / filter-on-read** is the defining architectural decision — keep
  it unless you deliberately revisit it (see "The architecture" above).