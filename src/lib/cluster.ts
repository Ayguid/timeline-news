// ============================================================================
// cluster.ts — the real product per soul.md.
// Groups recent raw_articles into candidate "events" using v1 heuristics:
//   same-day window + significant title-token overlap.
// No ML/embeddings yet — but this module is the clean seam to swap that in
// later. Keep signature stable: RawArticle[] -> EventCandidate[].
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
  'the a an and or of to in on for with at by from is are was were be has had have this that it its as not but how what when where who why'.split(' '),
);

function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function sameDay(a: Date, b: Date, windowHours = 24): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= windowHours * 60 * 60 * 1000;
}

/** Store article id -> raw article for lookups during clustering. */
export function clusterArticles(articles: RawArticleInput[], opts?: {
  windowHours?: number;
  minOverlap?: number; // jaccard threshold to consider two articles the same event
}): EventCandidate[] {
  const windowHours = opts?.windowHours ?? 24;
  const minOverlap = opts?.minOverlap ?? 0.35;

  const byId = new Map(articles.map((a) => [a.id, a]));
  const tokenSets = new Map(articles.map((a) => [a.id, new Set(tokens(a.title))]));
  const memberships = new Map<string, string[]>(); // candidateId -> member ids
  const used = new Set<string>();

  // Greedy: seed each event with an unused article, then absorb close SILINGS
  // within the time window. O(n^2) worst case — fine for <~500 recent articles.
  for (const seed of articles) {
    if (used.has(seed.id)) continue;

    const group: string[] = [seed.id];
    used.add(seed.id);
    const seedTokens = tokenSets.get(seed.id)!;

    for (const other of articles) {
      if (used.has(other.id)) continue;
      if (!sameDay(seed.publishedAt, other.publishedAt, windowHours)) continue;
      const ov = jaccard(seedTokens, tokenSets.get(other.id)!);
      if (ov >= minOverlap) {
        group.push(other.id);
        used.add(other.id);
      }
    }

    // representative = earliest publish time in group, then longest title
    const members = group
      .map((id) => byId.get(id)!)
      .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
    const representative = members[0];

    memberships.set(representative.id, group);
  }

  const candidates: EventCandidate[] = [];
  for (const [seedId, group] of memberships) {
    const members = group.map((id) => byId.get(id)!);
    const sorted = [...members].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
    const rep = sorted[0];
    const distinctSources = new Set(members.map((m) => m.sourceId));

    // Title = longest member title (usually most specific); summary lists
    // the distinct sources so the user can see corroboration at a glance.
    const title = [...members].sort((a, b) => b.title.length - a.title.length)[0].title;
    const sources = [...distinctSources];
    const summary =
      sources.length > 1
        ? `Covered by ${sources.length} sources. Primary headline: ${title}`
        : title;

    // Primary language = language of the earliest (representative) member,
    // falling back to the language spoken by the majority of members.
    const withLang = members.filter((m) => m.lang);
    const repLang = withLang[0]?.lang;
    const langCounts = new Map<string, number>();
    for (const m of withLang) langCounts.set(m.lang!, (langCounts.get(m.lang!) ?? 0) + 1);
    const lang = repLang ?? [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'en';

    candidates.push({
      title,
      summary,
      eventDate: rep.publishedAt,
      memberIds: group,
      sourceIds: sources,
      lang,
    });
  }

  return candidates;
}