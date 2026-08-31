// ============================================================================
// SourceAdapter — THE seam of the whole system.
//
// Every source (RSS feed, later HTML scrapers, etc.) implements this contract.
// Pipeline/ingest code depends ONLY on this interface; it never knows about
// RSS or HTML. Add a new source type by writing a new adapter — nothing else
// changes.
//
// Honest about copyright (soul.md): adapters return a SHORT summary excerpt
// + link, never full article text. The excerpt must not substitute for the
// original — keep it to a sentence or two.
// ============================================================================

/** A normalized article, as produced by ANY adapter. */
export interface AdapterArticle {
  /** Canonical URL — unique dedup key across sources. */
  url: string;
  title: string;
  /** Short, attribution-safe excerpt (≤ ~2 sentences). Never full text. */
  summaryExcerpt: string | null;
  /** When the publisher says it was published. */
  publishedAt: Date;
}

export interface AdapterFetchOptions {
  /** RSS/feed URL, or seed page URL for HTML adapters. */
  url: string;
  /** Maximum articles to return per fetch (safety cap). */
  limit?: number;
}

export interface AdapterFetchResult {
  articles: AdapterArticle[];
  /** True if the fetch hit a hard error (network, auth, malformed feed). */
  error?: { message: string };
}

/**
 * Contract every source adapter must implement.
 *
 * `id` is the stable string stored in `sources.adapter_type` AND
 * `source_adapters.adapter_type`. It is what the registry keys on.
 */
export interface SourceAdapter {
  /** Stable identifier, e.g. 'rss'. Must match source_adapters.adapter_type. */
  id: string;
  /** Human label, e.g. 'Generic RSS feed'. */
  name: string;

  /**
   * Fetch recent articles from a source. Implementations:
   *  - use RSS/Atom parsing for feeds
   *  - may check robots.txt before falling back to HTML scraping
   *  - MUST NOT return full article bodies
   */
  fetch(options: AdapterFetchOptions): Promise<AdapterFetchResult>;
}

// ============================================================================
// Registry — maps adapter_type -> implementation.
// Register new adapters here.
// ============================================================================
import { rssAdapter } from './rss';
import { htmlAdapter } from './html';

const adapterRegistry: Record<string, SourceAdapter> = {
  [rssAdapter.id]: rssAdapter,
  [htmlAdapter.id]: htmlAdapter,
};

export function getAdapter(type: string): SourceAdapter {
  const adapter = adapterRegistry[type];
  if (!adapter) {
    throw new Error(`Unknown adapter type: '${type}'. Register it in src/lib/adapters/index.ts`);
  }
  return adapter;
}

export function listAdapters(): SourceAdapter[] {
  return Object.values(adapterRegistry);
}