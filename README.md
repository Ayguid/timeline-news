# News Timeline

A chronological timeline of world events, multi-sourced. Reads several
newspapers/feeds, clusters related coverage into distinct events, scores them
for significance, and renders one clean date-ordered timeline — a **record**,
not a feed.

> **North star:** read [`soul.md`](./soul.md) before changing scope, sourcing,
> or UX. It is the non-negotiable context for every decision here.

---

## Status — v1 vertical slice (in progress)

A single end-to-end path is the goal before adding breadth:

**ingest (RSS adapter) → cluster → score → Postgres → API → timeline page.**

Implemented so far:
- [x] Schema & migrations (Postgres/Neon), applied idempotently by `npm run migrate`
- [x] `SourceAdapter` contract (the seam) + generic `rss` adapter
- [x] Clustering heuristic (same-day window + title-token overlap) — no ML yet
- [x] Significance scoring (source corroboration + curated topics), language-aware
- [x] User-curated sources (add/remove any RSS feed) — `npm run seed` pre-loads starters
- [x] Multi-language significance topics (en/es defaults) + per-user topic editor
- [x] NextAuth email magic-link auth (native adapter, no passwords)
- [x] API routes: `sources`, `timeline`, `topics`
- [x] Timeline page (chronological) + Sources page + topics editor
- [x] GitHub Actions cron ingestion (`ingest.yml`)

Planned / deferred:
- [ ] HTML scrapers for sources without RSS (cheerio, after robots.txt check)
- [ ] Manual approve/reject toggle on events (soul.md hybrid review)
- [ ] Better clustering (embeddings) behind the same seam
- [ ] More languages' default topic lists (beyond en/es)
- [ ] Event-detail view showing "how sources differed"
- [ ] Regional coverage labels / filters

---

## Feature flags & how things wire together

| Concern | File | Notes |
| --- | --- | --- |
| Adapter contract + registry | `src/lib/adapters/index.ts` | Add adapters here |
| Generic RSS adapter | `src/lib/adapters/rss.ts` | Ingest any user feed URL |
| Clustering | `src/lib/cluster.ts` | The product's hard part |
| Scoring | `src/lib/score.ts` | Thresholds live here |
| User topics (DB) | `src/lib/topics.ts` | effective = defaults ∪ user |
| Auth config | `src/auth.ts` | Email magic link |
| Native auth adapter | `src/lib/db-adapter.ts` | Postgres-backed |
| Pipeline (GH Actions) | `scripts/run-pipeline.ts` | ingest → cluster → score → persist |
| Seed (demo user/sources) | `scripts/seed.ts` | run once |

---

## Local development

Prereqs: Node 22+, a Postgres/Neon DB.

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, EMAIL_SERVER
npm run migrate             # apply migrations/ (idempotent)
npm run seed                # demo user + starter feeds + default topics
npm run pipeline            # fetch → cluster → score → persist
npm run dev                 # http://localhost:3000
```

One-off run without writing: `npm run pipeline:dry`.

### GitHub Actions ingestion

`.github/workflows/ingest.yml` runs the pipeline on cron (every 3h). Set repo
secrets: `DATABASE_URL`, `AUTH_SECRET`. Migrations + seed are applied in the
workflow before the pipeline.

---

## Data model (v1)

- `sources` (user-owned), `raw_articles` (URL-unique dedup), `events`
  (`proposed`/`approved`/`rejected`), `event_articles` join
- `significant_topics` (shared per-language defaults) + `user_topic_tokens`
  (per-user overrides)
- Unchanged upstream auth tables (`users`, `sessions`, `accounts`,
  `verification_tokens`)

## Notes / decisions

- **Attribution over reproduction** (soul.md #1): we store a short excerpt
  + link, never full article text.
- **Chronological by event date** (soul.md #3): v1 uses publish time as
  `event_date` with `date_inferred=true`; a later stage can refine to true
  event time.
- **Multi-source corroboration** (soul.md #2) is the top scoring input.