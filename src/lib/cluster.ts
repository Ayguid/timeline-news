// ============================================================================
// cluster.ts — the real product per soul.md.
// Groups recent raw_articles into candidate "events" using v1 heuristics:
//   pass 1: greedy grouping (same-day window + title-token Jaccard overlap)
//   pass 2: merge fragments (same event phrased differently by outlets) when
//           they share distinctive tokens within a wider window
// No ML/embeddings yet — but keep the signature stable: RawArticle[] ->
// EventCandidate[], so a smarter backend can slot in behind the same seam.
// ============================================================================

export interface RawArticleInput {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  publishedAt: Date;
  lang?: string; // source language, if known
}

export interface EventCandidate {
  title: string; // derived from the most representative article
  summary: string; // short, built from member titles (attribution-safe)
  eventDate: Date; // earliest/most representative publish time (v1)
  memberIds: string[]; // raw_articles.id members
  sourceIds: string[]; // distinct source_ids (corroboration)
  lang: string; // primary language of covering sources (for topic matching)
}

// --- normalization for token comparison --------------------------------
const STOPWORDS = new Set(
  'the a an and or of to in on for with at by from is are was were be has had have this that it its as not but how what when where who why off over into about after before against between under while during through'.split(' '),
);

function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Word-like tokens that are distinctive enough to signal "same event":
 *  length >= 6 (skips small function-ish words), stopword-filtered. */
function distinctive(title: string): Set<string> {
  const t = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  const out = new Set<string>();
  for (const w of t) if (w.length >= 6 && !STOPWORDS.has(w)) out.add(w);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
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

  // Title = longest member title (usually most specific); summary notes
  // corroboration so the user sees multi-source coverage at a glance.
  const title = [...members].sort((a, b) => b.title.length - a.title.length)[0].title;
  const sources = [...distinctSources];
  const summary =
    sources.length > 1
      ? `Covered by ${sources.length} sources. Primary headline: ${title}`
      : title;

  // Primary language = the earliest (representative) member's language,
  // falling back to the language spoken by the majority of members.
  const withLang = members.filter((m) => m.lang);
  const repLang = withLang[0]?.lang;
  const langCounts = new Map<string, number>();
  for (const m of withLang) langCounts.set(m.lang!, (langCounts.get(m.lang!) ?? 0) + 1);
  const lang = repLang ?? [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'en';

  return {
    title,
    summary,
    eventDate: rep.publishedAt,
    memberIds,
    sourceIds: sources,
    lang,
  };
}

/** Store article id -> raw article for lookups during clustering. */
export function clusterArticles(articles: RawArticleInput[], opts?: {
  windowHours?: number;
  minOverlap?: number; // jaccard threshold to call two articles the same event
  mergeHours?: number; // window for pass-2 fragment merging
  mergeTokens?: number; // distinctive shared tokens required to merge fragments
}): EventCandidate[] {
  const windowHours = opts?.windowHours ?? 24;
  const minOverlap = opts?.minOverlap ?? 0.35;
  const mergeHours = opts?.mergeHours ?? 72;
  const mergeTokens = opts?.mergeTokens ?? 2;

  const byId = new Map(articles.map((a) => [a.id, a]));
  const tokenSets = new Map(articles.map((a) => [a.id, new Set(tokens(a.title))]));
  const used = new Set<string>();
  const groups: string[][] = [];

  // Pass 1 — greedy: seed each event with an unused article, absorb close
  // siblings within the time window. O(n^2) worst case — fine for <~500.
  for (const seed of articles) {
    if (used.has(seed.id)) continue;

    const group: string[] = [seed.id];
    used.add(seed.id);
    const seedTokens = tokenSets.get(seed.id)!;

    for (const other of articles) {
      if (used.has(other.id)) continue;
      if (!withinWindow(seed.publishedAt, other.publishedAt, windowHours)) continue;
      if (jaccard(seedTokens, tokenSets.get(other.id)!) >= minOverlap) {
        group.push(other.id);
        used.add(other.id);
      }
    }
    groups.push(group);
  }

  // Pass 2 — merge fragments: outlets phrase one story very differently, so
  // pass-1 Jaccard misses them (observed: Nepal-Tibet floods, 1 event split
  // across 5 headlines). Merge two groups when their members share enough
  // DISTINCTIVE tokens within a wider window.
  const groupTokens = groups.map((g) => {
    const set = new Set<string>();
    for (const id of g) for (const t of distinctive(byId.get(id)!.title)) set.add(t);
    return set;
  });

  const merged: number[] = []; // group indices already folded in
  const final: EventCandidate[] = [];

  for (let i = 0; i < groups.length; i++) {
    if (merged.includes(i)) continue;
    const acc: string[] = [...groups[i]];
    const accTokens = new Set(groupTokens[i]);

    for (let j = i + 1; j < groups.length; j++) {
      if (merged.includes(j)) continue;
      // merge only if temporally close AND share enough distinctive tokens
      const aDate = byId.get(groups[i][0])!.publishedAt;
      const bDate = byId.get(groups[j][0])!.publishedAt;
      if (!withinWindow(aDate, bDate, mergeHours)) continue;

      let shared = 0;
      for (const t of accTokens) if (groupTokens[j].has(t)) shared++;
      if (shared < mergeTokens) continue;

      acc.push(...groups[j]);
      for (const t of groupTokens[j]) accTokens.add(t);
      merged.push(j);
    }

    final.push(buildCandidate(acc, byId));
  }

  return final;
}