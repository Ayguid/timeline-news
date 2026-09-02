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
  where automation proposes and a human approves?