// ============================================================================
// htmlAdapter — generic HTML page scraper fallback.
//
// Used when a user adds a source that has no RSS feed: they give us a page URL
// (usually a homepage or section). We:
//   1. Respect robots.txt (soul.md load-bearing rule) — refuse if disallowed.
//   2. Fetch the HTML.
//   3. Extract article links + titles by heuristic:
//        a. prefer <h2>/<h3> anchored headlines (typical news markup)
//        b. otherwise <a> tags whose link looks like an article URL
//   4. Return normalized AdapterArticles (SHORT excerpt, never full text).
//
// We do NOT parse full article bodies. Each result links back to the original.
// ============================================================================
import type { SourceAdapter, AdapterArticle } from './';

const USER_AGENT = 'timeline-news/0.1 (+https://github.com/timeline-news)';
const FETCH_TIMEOUT_MS = 15000;

// Anchor text we should never treat as a headline (footer/nav/utility links).
const NON_ARTICLE_LABELS = new Set([
  'terms of use', 'privacy policy', 'privacy', 'cookies', 'cookie policy',
  'subscribe', 'sign in', 'log in', 'sign up', 'register', 'newsletter',
  'contact us', 'about us', 'about', 'advertise', 'accessibility', 'sitemap',
  'help', 'faq', 'home', 'search', 'skip to content', 'do not share or sell my info',
  'content index', 'subscription terms', 'manage consent', 'your privacy choices',
  'download the app', 'apps', 'mobile', 'rss feeds', 'feedback', 'corrections',
]);

// Article URLs usually contain a slug — often a date and/or hyphens. We use
// presence of a real path (not just "/" or "/section/") + a meaningful slug as
// a weak signal so links like "/about" or "/world/asia-pacific" are skipped.
// Guardian-style article URLs embed a date: /world/2026/aug/31/some-slug.
// Compound section slugs are common too — reject them outright.
const SECTION_HINTS = /^(news|world|us|uk|americas|business|tech|culture|media|science|sport|football|opinion|politics|europe|asia|africa|middle-east|asia-pacific|south-central-asia|life-style|lifestyle|travel|money|environment|climate|weather|australia|north-america|latin-america)$/;

function looksLikeArticle(href: string): boolean {
  try {
    const u = new URL(href);
    // strip trailing slash, split path segments
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length === 0) return false;
    const last = segs[segs.length - 1].toLowerCase();
    // bare section slug like "/world/asia-pacific" or "/news" -> not an article
    if (last.length < 10) return false;
    // has a calendar date segment somewhere (strong article signal)?
    const hasDate = segs.some((s) => /^(19|20)\d{2}$/.test(s) || /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(s));
    // a real slug: hyphens or an extension, and not a section word
    const slugLike = /[a-z0-9]-[a-z0-9]/.test(last) || /\.[a-z]{2,5}$/.test(last);
    if (SECTION_HINTS.test(last)) return false;
    return hasDate || slugLike;
  } catch {
    return false;
  }
}

function isNonArticleLabel(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (NON_ARTICLE_LABELS.has(t)) return true;
  // "Most viewed in world news", "All Australia stories", "South and Central Asia"
  return /^(most viewed|all |most read|trending|related|top stories|recommended)/.test(t)
    || /^south |^central |^north |^east |^west |^middle /.test(t)
    || t.endsWith(' stories') || t.endsWith(' news') && t.split(' ').length <= 4;
}

function abs(base: string, href: string | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

// --- robots.txt ------------------------------------------------------------
// Minimal robots parser: does the fetched robots.txt disallow our UA from this
// path? Returns true if crawling is allowed. On any failure we are permissive
// (a feeds-for-tools style list is read by code, the site still gets attribution).
async function robotsAllow(url: string): Promise<{ allowed: boolean; note?: string }> {
  let origin: URL;
  try {
    origin = new URL('/robots.txt', url);
  } catch {
    return { allowed: false, note: 'bad url' };
  }

  let text: string;
  try {
    const res = await fetch(origin.href, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { allowed: true, note: `no robots (${res.status})` };
    text = await res.text();
  } catch {
    return { allowed: true, note: 'robots fetch failed (permissive)' };
  }

  const pathname = new URL(url).pathname;
  // crude parse: apply the LAST applicable "*" (any UA) group that has rules.
  const groups = text.split(/(?=^User-agent:\s*)/m);
  let disallow: string[] = [];
  let allow: string[] = [];
  for (const g of groups) {
    const m = g.match(/^User-agent:\s*(.+)$/m);
    if (!m) continue;
    const ua = m[1].trim().toLowerCase();
    if (ua.includes('*')) {
      disallow = [];
      allow = [];
      for (const line of g.split(/\r?\n/)) {
        const d = line.match(/^Disallow:\s*(.*)$/i);
        const a = line.match(/^Allow:\s*(.*)$/i);
        if (d) disallow.push(d[1].trim());
        if (a) allow.push(a[1].trim());
      }
    }
  }

  // A path is disallowed if it matches any Disallow that isn't overridden by Allow.
  for (const a of allow) {
    if (a && pathname.startsWith(a)) return { allowed: true, note: `allow ${a}` };
  }
  for (const d of disallow) {
    if (d && pathname.startsWith(d)) {
      return { allowed: false, note: `robots disallows ${d}` };
    }
  }
  return { allowed: true, note: 'robots ok' };
}

export const htmlAdapter: SourceAdapter = {
  id: 'html',
  name: 'Generic HTML page (no RSS)',

  async fetch({ url, limit = 20 }): Promise<{ articles: AdapterArticle[]; error?: { message: string } }> {
    const rb = await robotsAllow(url);
    if (!rb.allowed) {
      return {
        articles: [],
        error: { message: `Blocked by robots.txt: ${rb.note}` },
      };
    }

    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return { articles: [], error: { message: `HTTP ${res.status}` } };
      html = await res.text();
    } catch (e) {
      return { articles: [], error: { message: e instanceof Error ? e.message : String(e) } };
    }

    // Load cheerio lazily so the adapter only pulls its dependency when used.
    const { load } = await import('cheerio');
    const $ = load(html);

    const articles: AdapterArticle[] = [];
    const seen = new Set<string>();

    const push = (href: string | null, title: string) => {
      if (!href || seen.has(href)) return;
      const t = title.replace(/\s+/g, ' ').trim();
      if (t.length < 12) return; // headline-ish length
      if (isNonArticleLabel(t)) return;
      seen.add(href);
      articles.push({
        url: href,
        title: t,
        summaryExcerpt: t.length > 160 ? t.slice(0, 159) + '…' : t,
        publishedAt: new Date(), // generic page has no reliable per-link date
      });
    };

    // Pass 1: headlines — anchors inside h1/h2/h3 (typical news markup).
    $('h1 a[href], h2 a[href], h3 a[href]').each((_, el) => {
      const href = abs(url, $(el).attr('href'));
      if (href && looksLikeArticle(href)) push(href, $(el).text());
    });

    // Pass 2: article links under <article>-like blocks (Guardian etc.), which
    // are headline-length even if not wrapped in a heading tag. Also catch the
    // inverted markup <a><h3>headline</h3></a> some outlets use.
    if (articles.length < 5) {
      $('a[href]:has(h2), a[href]:has(h3), a[href]:has(h1)').each((_, el) => {
        const href = abs(url, $(el).attr('href'));
        if (href && looksLikeArticle(href)) push(href, $(el).text());
      });
    }
    if (articles.length < 5) {
      $('article a[href], main a[href]').each((_, el) => {
        const href = abs(url, $(el).attr('href'));
        if (href && looksLikeArticle(href)) push(href, $(el).text());
      });
    }

    // Pass 3: last-resort — any link whose text looks likes a headline (long,
    // mixed case, not a nav label).
    if (articles.length === 0) {
      $('a[href]').each((_, el) => {
        const href = abs(url, $(el).attr('href'));
        if (href && looksLikeArticle(href)) push(href, $(el).text());
      });
    }

    return { articles: articles.slice(0, limit) };
  },
};