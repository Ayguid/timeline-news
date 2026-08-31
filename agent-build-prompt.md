# Agent Build Prompt — News Timeline

Copy everything below the line into your coding agent (Claude Code, etc.) as
the first message. It includes the project's soul.md, the recommended stack,
and the full v1 architecture, and asks the agent to plan before it codes.

---

## PROMPT START

I'm building a news timeline app. It scrapes multiple newspapers, clusters
related coverage into distinct "events," scores them for significance, and
renders a clean chronological timeline. Read the project soul below — it's
the non-negotiable context for every decision you make on this project.

### soul.md

# Soul.md — News Timeline

> This file is the project's north star. Read it before making any decision that
> touches scope, sourcing, or UX. If a feature idea conflicts with this doc,
> the doc wins — or the doc gets deliberately rewritten, not silently ignored.

## What this is

A tool that scrapes multiple newspapers and turns the noise of daily news into
a clean, chronological timeline of the events that actually matter — not
another feed, a **record**.

## The problem

News today is fragmented, repetitive, and optimized for engagement, not
understanding. The same event gets covered a hundred times with a hundred
slightly different spins, and it's genuinely hard to answer a simple
question: *"what actually happened, in what order, and who's saying what
about it?"* This project exists to answer that question.

## The vision

A year from now, someone should be able to open this project and reconstruct
"what happened in the world" for any week, without needing to have followed
the news live. It should feel less like a news app and more like a
well-kept historical archive that updates itself daily.

## Who it's for

People who want signal, not scroll — someone catching up after being away,
a researcher, or just someone tired of algorithmic feeds deciding what's
"important" for them.

## Core principles (non-negotiable)

1. **Attribution over reproduction.** Every event links back to its original
   source(s). We summarize and cite; we never republish full articles or
   paywalled content. (See Copyright & Legality below — this one is load-bearing.)
2. **Multi-source by default.** A "significant" event should be corroborated
   or at least cross-referenced across more than one outlet before it earns
   a spot on the timeline. One outlet's claim is a lead, not a fact.
3. **Event time, not publish time.** The timeline is ordered by when things
   *happened*, not when an article about them went live. These often differ.
4. **Visible bias, not hidden bias.** If sources frame an event differently,
   show that — don't launder it into one "neutral" paragraph that quietly
   picks a side. Transparency about disagreement is more honest than fake consensus.
5. **Significance has a bar.** Not every headline deserves a timeline entry.
   Define (and keep revisiting) what "world-significant" means so the
   timeline doesn't degrade into a firehose.

## What this is NOT

- Not a scraper that mirrors/republishes full paywalled articles.
- Not a "breaking news" doom-feed optimized for refresh-checking.
- Not a single-source aggregator wearing a neutral-sounding UI.
- Not a general-purpose news reader — curation is the whole point.

## Copyright & legality (read before writing the scraper)

- Respect `robots.txt` and each site's Terms of Service. If a source
  explicitly disallows scraping, don't route around it.
- Store and display **summaries + links + short attributed excerpts**, not
  full article text. A good rule of thumb: what you keep should never be a
  substitute for clicking through to the source.
- Prefer official APIs/RSS feeds over scraping HTML wherever a source offers one.
- Keep a per-source adapter so you can drop a source instantly if it asks you to.

## What "success" looks like

- A person can pick any past week and get an accurate, ordered picture of
  what happened — without needing to have been paying attention live.
- Every entry is traceable: click it, see the sources, see how they differed.
- The "noise" bar actually holds — the timeline stays skimmable, not endless.

## Anti-goals / traps to avoid

- Chasing volume of sources over quality of clustering/dedup logic.
- Letting "significant" quietly become "whatever trended on social media."
- Building a slick UI before the event-clustering/dedup problem is actually solved —
  that's the hard, valuable part; the UI is not.

## Loose technical philosophy

- **Per-source adapters**, not one giant scraper — each newspaper gets its
  own small, swappable module.
- **A dedup/clustering layer is the real product.** Raw scraped articles →
  clustered into "events" → events placed on the timeline. This is the core
  engineering problem, not an afterthought.
- Keep the data model human-readable (event, date, sources[], summary,
  significance-score) so it's debuggable by eye, not just by query.

## Open questions (revisit these, don't let them go stale)

- What counts as "world-significant" — a fixed topic list, an editorial
  threshold, source-count corroboration, something else?
- How many source languages/regions are in scope for v1?
- Manual curation vs. fully automated significance scoring — or a hybrid
  where automation proposes and a human (you) approves?

### Chosen stack (decided, not up for reinvention)

- **Language:** TypeScript, end to end.
- **Frontend + API:** Next.js (App Router), deployed on **Vercel free tier**.
- **Database:** Postgres on **Neon** (serverless, free tier).
- **Scraping/clustering pipeline:** standalone TS scripts, run on a schedule
  via **GitHub Actions** (cron), not a long-running server — this is what
  keeps hosting free.
- **Scraping method:** prefer each source's RSS feed over HTML scraping.
  Fall back to HTML parsing (e.g. `cheerio`) only when no feed exists, and
  only after checking `robots.txt`.

Reasoning, for context: this keeps everything on free infrastructure with no
always-on server. GitHub Actions gives free scheduled compute for ingestion;
Vercel + Neon handle the always-available read path (the website).

### Data model (v1)

- `sources` — id, name, homepage_url, rss_url, adapter_type, active
- `raw_articles` — id, source_id, url (unique), title, published_at,
  scraped_at, summary_excerpt (short, attribution-safe — not full text)
- `events` — id, title, summary, event_date, significance_score,
  status (`proposed` | `approved`), created_at
- `event_articles` — event_id, article_id (join table; an event can cite
  multiple articles, an article can potentially belong to one event)

### Pipeline stages (v1)

1. **Ingest** — one adapter per source (RSS parse, normalize into
   `raw_articles`). Each adapter is a small, independently testable module.
2. **Cluster** — group recent `raw_articles` into candidate events using
   simple heuristics for v1: same-day window + title/keyword overlap
   (no ML/embeddings yet — leave a clean seam to swap this in later).
3. **Score** — significance = (distinct source count) + (keyword/category
   match against a small curated "significant topics" list). Store as
   `proposed` if above threshold.
4. **Review (optional for v1)** — flip `proposed` → `approved` either
   automatically past a higher threshold, or via a minimal manual toggle.
5. **Render** — frontend queries `approved` events ordered by `event_date`,
   grouped by day/week.

### What I want from you right now

Don't start writing the full app yet. First:

1. Propose the repo structure (monorepo layout, where the GitHub Actions
   scripts live vs. the Next.js app, shared types, etc).
2. Confirm or refine the data model above — flag anything you'd change and why.
3. Write the Postgres schema/migration for the data model.
4. Define the `SourceAdapter` interface (the contract every source adapter
   implements) — this is the most important seam in the whole system, get
   it right before building the first adapter.
5. Once 1–4 are agreed, build ONE end-to-end vertical slice: one real source
   adapter → ingest script → clustering heuristic → DB → one API route →
   a minimal timeline page. Everything else (more sources, better scoring,
   nicer UI) comes after that slice works end to end.

Ask me anything you need clarified before step 1 — otherwise state your
assumptions and proceed.

## PROMPT END