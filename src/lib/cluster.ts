// ============================================================================
// cluster.ts — the real product per soul.md.
// Groups recent raw_articles into candidate "events".
//
// Core idea (kept deliberately simple): two articles are the same event iff
// their CONTENT overlaps — the title AND the article's own words (summary).
// Same-event pieces share proper nouns and specifics (Shein, Leipzig, Sinai);
// unrelated stories share only generic news vocabulary (deadly/attack/police),
// which does NOT clear the shared-word bar. No token-frequency tricks, no
// per-language machinery — one consistent similarity measure, used by both
// passes:
//   pass 1: same-day, greedy grouping
//   pass 2: wider-window fragment merging of the SAME measure
//
// Stability: RawArticle[] -> EventCandidate[], so a smarter backend can slot
// in behind the same seam later.
// ============================================================================

export interface RawArticleInput {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  publishedAt: Date;
  lang?: string; // source language, if known
  summary?: string; // the article's OWN words (excerpt). The truth-teller for
  // whether two pieces cover the same event. Not full text, not a republish.
}

export interface EventCandidate {
  title: string; // derived from the most representative article
  summary: string; // short, built from member titles (attribution-safe)
  eventDate: Date; // earliest/most representative publish time (v1)
  memberIds: string[]; // raw_articles.id members
  sourceIds: string[]; // distinct source_ids (corroboration)
  lang: string; // primary language of covering sources (for topic matching)
}

// --- normalization -------------------------------------------------------
const STOPWORDS = new Set(
  'the a an and or of to in on for with at by from is are was were be has had have this that it its as not but how what when where who why off over into about after before against between under while during through'.split(' '),
);

/** All the content words of an article: headline + its own body words. */
function articleText(a: RawArticleInput): string {
  return a.summary ? `${a.title} ${a.summary}` : a.title;
}

function tokens(a: RawArticleInput): Set<string> {
  const set = new Set<string>();
  for (const w of articleText(a).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length >= 4 && !STOPWORDS.has(w)) set.add(w);
  }
  return set;
}

/**
 * Detect multi-topic "digest" headlines. A roundup materializes several
 * unrelated stories in one headline (e.g. NPR: "SCOTUS allows Trump's ballroom
 * project to continue. And, the Army secretary…"). If such a title is
 * clustered, its shared tokens BRIDGE two unrelated events into one. These
 * don't represent a single event, so we EXCLUDE them from clustering.
 */
function isDigestTitle(title: string): boolean {
  const t = title.trim();
  if (/(News live|Live blog|Live :|Live:|In case you missed|What to know|Here.s what happened|roundup|recap|overnight digest|morning digest|open thread)/i.test(t)) {
    return true;
  }
  // "…continue. And, the Army secretary" — a second clause = a second topic.
  if (/(?<=[a-z0-9])\.[ ]+(And|But|Also|Meanwhile|Plus|Elsewhere|Separately),?/i.test(t)) {
    return true;
  }
  return false;
}

/** Same event iff enough content words are shared (title + summary). */
function sharesContent(a: Set<string>, b: Set<string>, minShared: number, minOverlap: number): boolean {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  if (shared < minShared) return false;
  if (a.size === 0 || b.size === 0) return false;
  return shared / (a.size + b.size - shared) >= minOverlap;
}

/**
 * The RARE tokens of an article — the proper nouns and specific terms that
 * identify one event. A token counts as rare only if it appears in a small
 * fraction of the batch (tight 3% floor). Generic news words (deadly/attack/
 * police) recur across many unrelated stories and never identify a single
 * event, so they are EXCLUDED even though they're not stopwords.
 * Use this for pass-2 fragment merging: two fragments are the same event iff
 * they share a genuinely-rare proper noun (Shein ⨯ Carney must never merge;
 * Shein-IPO ⨯ Shein-debut must).
 */
function rareTokens(
  articleIds: string[],
  byId: Map<string, RawArticleInput>,
  tokensOf: Map<string, Set<string>>,
  dfFloor = 0.03,
): Set<string>[] {
  const n = articleIds.length;
  const df = new Map<string, number>();
  for (const id of articleIds) for (const t of tokensOf.get(id)!) df.set(t, (df.get(t) ?? 0) + 1);
  const sparse = new Set<string>();
  for (const [t, c] of df) if (c / n <= dfFloor) sparse.add(t);
  return articleIds.map((id) => {
    const out = new Set<string>();
    for (const t of tokensOf.get(id)!) if (sparse.has(t)) out.add(t);
    return out;
  });
}

function withinWindow(a: Date, b: Date, windowHours: number): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= windowHours * 60 * 60 * 1000;
}

/** Build a single EventCandidate from its member article ids. */
function buildCandidate(memberIds: string[], byId: Map<string, RawArticleInput>): EventCandidate {
  const members = memberIds.map((id) => byId.get(id)!);
  const sorted = [...members].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const rep = sorted[0];
  const distinctSources = new Set(members.map((m) => m.sourceId));

  const title = [...members].sort((a, b) => b.title.length - a.title.length)[0].title;
  const sources = [...distinctSources];
  const summary =
    sources.length > 1
      ? `Covered by ${sources.length} sources. Primary headline: ${title}`
      : title;

  const withLang = members.filter((m) => m.lang);
  const repLang = withLang[0]?.lang;
  const langCounts = new Map<string, number>();
  for (const m of withLang) langCounts.set(m.lang!, (langCounts.get(m.lang!) ?? 0) + 1);
  const lang = repLang ?? [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'en';

  return { title, summary, eventDate: rep.publishedAt, memberIds, sourceIds: sources, lang };
}

/** Store article id -> raw article for lookups during clustering. */
export function clusterArticles(articles: RawArticleInput[], opts?: {
  windowHours?: number; // pass-1 same-day window
  minShared?: number;   // min shared content words to fuse two articles
  minOverlap?: number;  // min Jaccard on title+summary to fuse two articles
  mergeHours?: number;  // pass-2 window for fragment merging
  mergeTokens?: number; // min shared words to merge two fragments
}): EventCandidate[] {
  const windowHours = opts?.windowHours ?? 24;
  const minShared = opts?.minShared ?? 4;
  const minOverlap = opts?.minOverlap ?? 0.22;
  const mergeHours = opts?.mergeHours ?? 72;
  const mergeTokens = opts?.mergeTokens ?? 1;

  const clusterable = articles.filter((a) => !isDigestTitle(a.title));

  const byId = new Map(clusterable.map((a) => [a.id, a]));
  const tokenSets = new Map(clusterable.map((a) => [a.id, tokens(a)]));
  const used = new Set<string>();
  const groups: string[][] = [];

  // Pass 1 — greedy on content similarity (title + summary).
  for (const seed of clusterable) {
    if (used.has(seed.id)) continue;
    const group: string[] = [seed.id];
    used.add(seed.id);
    const seedTokens = tokenSets.get(seed.id)!;
    for (const other of clusterable) {
      if (used.has(other.id)) continue;
      if (!withinWindow(seed.publishedAt, other.publishedAt, windowHours)) continue;
      if (sharesContent(seedTokens, tokenSets.get(other.id)!, minShared, minOverlap)) {
        group.push(other.id);
        used.add(other.id);
      }
    }
    groups.push(group);
  }

  // Pass 2 — merge fragments of the same event phrased differently. Two
  // fragments are the same event iff they share a RARE token (a proper noun /
  // specific term: Shein, Leipzig, Sinai). Common news words (deadly/attack/
  // police) never trigger a merge — that's what kept the Swiss-rave ⨯
  // Colombia-bomb pair fused.
  const groupRare: Set<string>[] = groups.map((g) =>
    rareTokens(g, byId, tokenSets).reduce((acc, set) => {
      for (const t of set) acc.add(t);
      return acc;
    }, new Set<string>()),
  );

  const merged: number[] = [];
  const final: EventCandidate[] = [];

  for (let i = 0; i < groups.length; i++) {
    if (merged.includes(i)) continue;
    const acc: string[] = [...groups[i]];
    const accRare = new Set(groupRare[i]);

    for (let j = i + 1; j < groups.length; j++) {
      if (merged.includes(j)) continue;
      const aDate = byId.get(groups[i][0])!.publishedAt;
      const bDate = byId.get(groups[j][0])!.publishedAt;
      if (!withinWindow(aDate, bDate, mergeHours)) continue;
      // Merge only on a shared genuinely-rare (proper-noun) token.
      let shared = 0;
      for (const t of accRare) if (groupRare[j].has(t)) shared++;
      if (shared < mergeTokens) continue;
      acc.push(...groups[j]);
      for (const t of groupRare[j]) accRare.add(t);
      merged.push(j);
    }
    final.push(buildCandidate(acc, byId));
  }

  return final;
}