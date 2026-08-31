// ============================================================================
// rssAdapter — generic RSS/Atom feed adapter.
//
// Uses rss-parser. Returns normalized AdapterArticles (short excerpt + link,
// never full text). This one adapter ingests ANY RSS feed a user subscribes to —
// that's how "user picks their own sources" stays cheap: one adapter type, N
// arbitrary user-added feed URLs.
// ============================================================================
import Parser from 'rss-parser';
import type { SourceAdapter, AdapterArticle } from './';

const parser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'timeline-news/0.1 (+https://github.com/timeline-news)' },
});

/** Shrink a title to a short attribution-safe excerpt. */
function excerptFromTitle(title: string, maxChars = 160): string | null {
  const t = title.trim();
  if (!t) return null;
  return t.length > maxChars ? t.slice(0, maxChars - 1) + '…' : t;
}

function normalizeDate(input: string | number | Date | undefined): Date {
  const d = input ? new Date(input) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export const rssAdapter: SourceAdapter = {
  id: 'rss',
  name: 'Generic RSS/Atom feed',

  async fetch({ url, limit = 50 }): Promise<{ articles: AdapterArticle[]; error?: { message: string } }> {
    try {
      const feed = await parser.parseURL(url);
      const items = (feed.items ?? []).slice(0, limit);

      const articles: AdapterArticle[] = items.map((item) => ({
        url: item.link ?? item.guid ?? '',
        title: item.title ?? '(untitled)',
        summaryExcerpt: excerptFromTitle(item.title ?? ''),
        publishedAt: normalizeDate(item.isoDate ?? item.pubDate),
      }));

      // Skip items with no usable URL (we dedup + cite by URL).
      return { articles: articles.filter((a) => a.url.length > 0) };
    } catch (err) {
      return { articles: [], error: { message: err instanceof Error ? err.message : String(err) } };
    }
  },
};