# News Timeline

A chronological timeline of world events, multi-sourced. Scrapes newspapers and
feeds into a shared event store, clusters related coverage into distinct
events, scores them for significance, and renders one clean date-ordered
timeline per user — a **record**, not a feed.

> **North star:** read [`soul.md`](./soul.md) before changing scope, sourcing,
> or UX. It is the non-negotiable context for every decision here.

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
      (capped). Users pick which global sources they want via `user_sources` —
      a filter preference, never a copy of the news.
- [x] Clustering heuristic — 2 passes: token-overlap grouping, then
      fragment merge on df-weighted RARE tokens (proper nouns), so unrelated
      stories sharing common words (police/sydney) are NOT fused
- [x] Significance scoring (source corroboration + per-language curated topics),
      computed once per tier
- [x] Multi-language significance topics (en/es) with per-topic activation
- [x] NextAuth auth: Google OAuth / email magic link; `admin` role for sourcing
- [x] Admin "Run now" pipeline trigger (`/api/pipeline/run`, GitHub dispatch)
- [x] API routes: `sources`, `sources/[id]`, `timeline`, `topics`,
      `topics/settings`, `pipeline/run`
- [x] Timeline page (chronological) + Sources page + topics editor
- [x] GitHub Actions cron ingestion (`ingest.yml`)
- [x] Scale-safe pipeline: parallel fetch (concurrency-capped) + batched inserts
      + bulk-preloaded scoring (~10× faster than naive, measured against Neon)

Planned / deferred:
- [ ] Manual approve/reject toggle on events (soul.md hybrid review)
- [ ] Better clustering (embeddings) behind the same seam
- [ ] More languages' default topic lists (beyond en/es)
- [ ] Event-detail view showing "how sources differed"
- [ ] Admin UI for approving user-submitted sources (if "propose a source" added)

---

## The architecture: shared news, personal view

The core scaling decision: **news is stored once and shared; personalisation is a
filter, not a copy.** This avoids O(users × sources) duplication.

```
sources.owner_id  NULL = GLOBAL source (admin-curated, scraped once)
                  <uid> = PERSONAL source (that user's own; capped)

events.user_id    NULL = GLOBAL event (built from global feeds, shared)
                  <uid> = PERSONAL event (built from that user's own feeds)

user_sources      (user_id, source_id, enabled) — which global sources a user
                  has switched on for their timeline.

Timeline (per user) = global events whose covering sources the user enabled
                     ∪ that user's personal events.
```

- Global events are scored with the built-in topics **once** (deterministic,
  shared, auto-approved by corroboration threshold).
- Personal events are scored with that user's topic preferences.
- A user enables/disables global sources and adds a few personal ones; they
  never accumulate stored articles/events copies themselves.

## Feature flags & how things wire together

| Concern | File | Notes |
| --- | --- | --- |
| Adapter contract + registry | `src/lib/adapters/index.ts` | Add adapters here |
| Generic RSS adapter | `src/lib/adapters/rss.ts` | Any feed URL |
| Generic HTML scraper | `src/lib/adapters/html.ts` | robots.txt-aware fallback |
| Clustering | `src/lib/cluster.ts` | The product's hard part |
| Scoring | `src/lib/score.ts` | Thresholds live here |
| Topics (DB) | `src/lib/topics.ts` | defaults ∪ per-topic user toggles |
| Auth + roles | `src/lib/session.ts`, `src/auth.ts` | admin/user |
| Pipeline (GH Actions) | `scripts/run-pipeline.ts` | two-tier ingest→cluster→score |
| Seed | `scripts/seed.ts` | demo admin + global sources + topics |

---

## Local development

Prereqs: Node 22+, a Postgres/Neon DB.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, EMAIL_SERVER
npm run migrate             # apply migrations/ (idempotent)
npm run seed                # demo admin + global starter feeds + topics
npm run pipeline            # fetch → cluster → score → persist
npm run dev                 # http://localhost:3000
```

One-off run without writing: `npm run pipeline:dry`.

The seeded demo user is an **admin** and has all global sources enabled, so the
timeline is populated out of the box.

### Authentication & roles

Auth providers mount automatically when configured:

- **Google OAuth:** https://console.cloud.google.com/apis/credentials → OAuth
  client (Web app). Redirect URI `https://<domain>/api/auth/callback/google`
  (or `http://localhost:3000/...` locally). Set `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_AUTH_GOOGLE_ID`.
- **Email magic link:** set `EMAIL_SERVER` (SMTP/resend/brevo) + `EMAIL_FROM`.
- **Roles:** `users.role` is `admin` (may add/edit/delete GLOBAL sources, run
  the pipeline) or `user` (enables global sources, adds personal ones, edits
  topics). Promote a user to `admin` in the DB.
- Dev-only demo login (`/auth/signin` → "Demo login") maps to the seeded admin
  and is NODE_ENV=development-only.

### Admin "refresh now"

Admin → `POST /api/pipeline/run` fires `ingest.yml` via GitHub
`workflow_dispatch`, so you don't wait for the 3h cron. Requires
`GITHUB_REPO` + `GITHUB_TOKEN` env/secrets; returns 501 locally.

### GitHub Actions ingestion

`.github/workflows/ingest.yml` runs the pipeline on cron (every 3h). Repo
secrets: `DATABASE_URL`, `AUTH_SECRET`. Migrations + seed are applied before
the pipeline.

---

## Data model (current)

- `sources` (global `owner_id NULL` + personal `owner_id = user`, feed_url
  unique globally), `raw_articles` (URL-unique dedup), `events`
  (`user_id NULL` = global, or = owner; `proposed`/`approved`/`rejected`),
  `event_articles` join, `user_sources` (enabled global sources per user)
- `significant_topics` (shared per-language defaults) + `user_topic_tokens`
  (per-user overrides) + `user_disabled_default_topics` (per-topic toggle)
- Auth tables: `users` (with `role`), `sessions`, `accounts`,
  `verification_tokens`

## Notes / decisions

- **Attribution over reproduction** (soul.md #1): we store a short excerpt
  + link, never full article text.
- **Chronological by event date** (soul.md #3): publish time as `event_date`
  with `date_inferred=true`; a later stage can refine to true event time.
- **Multi-source corroboration** (soul.md #2) is the top scoring input.
- **Shared-but-personal** (this readme): news stored once, views filtered by
  source + topic preferences — the entire point of the two-tier model.