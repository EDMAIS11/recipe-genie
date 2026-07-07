// Jina Reader client (replaces Firecrawl).
//
// Uses three free/cheap Jina endpoints:
//   - r.jina.ai/<url>   -> clean markdown (and, on a second call, HTML)
//   - s.jina.ai/?q=...  -> web search returning top results with URLs
//   - the target site's sitemap.xml, FETCHED THROUGH r.jina.ai -> URL discovery
//
// Set JINA_API_KEY in your environment for higher rate limits. Requests still
// work without a key but are throttled more aggressively.

const READER_BASE = "https://r.jina.ai/";
const SEARCH_BASE = "https://s.jina.ai/";

function jinaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.JINA_API_KEY;
  return {
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

/**
 * Scrape a single page. Returns clean markdown and (optionally) the raw HTML,
 * which some callers need to read JSON-LD / og:image out of the page.
 */
export async function jinaScrape(
  url: string,
  opts: { includeHtml?: boolean } = {},
): Promise<{ markdown: string; html: string; metadata: Record<string, unknown> }> {
  // 1) Markdown (JSON response so we also get title/metadata).
  const mdRes = await fetch(READER_BASE + url, {
    headers: jinaHeaders({ Accept: "application/json" }),
  });
  if (!mdRes.ok) {
    throw new Error(`Jina Reader falhou (${mdRes.status}) para ${url}`);
  }
  const mdJson: any = await mdRes.json();
  const data = mdJson?.data ?? mdJson ?? {};
  const markdown: string = data?.content ?? "";
  const metadata: Record<string, unknown> = {
    title: data?.title,
    ogImage: data?.images?.[0] ?? data?.image ?? undefined,
    ...(data?.metadata ?? {}),
  };

  // 2) Raw HTML (second call) only when the caller needs it — e.g. to detect a
  //    Recipe JSON-LD schema. Kept optional to avoid doubling every request.
  let html = "";
  if (opts.includeHtml) {
    const htmlRes = await fetch(READER_BASE + url, {
      headers: jinaHeaders({ "x-return-format": "html" }),
    });
    if (htmlRes.ok) {
      html = await htmlRes.text();
    }
  }

  return { markdown, html, metadata };
}

/**
 * Web search. Returns up to `limit` results (url + title + snippet/content).
 * Replaces Firecrawl's fc.search().
 */
export async function jinaSearch(
  query: string,
  opts: { limit?: number } = {},
): Promise<Array<{ url: string; title: string; content: string }>> {
  const res = await fetch(SEARCH_BASE + encodeURIComponent(query), {
    headers: jinaHeaders({ Accept: "application/json" }),
  });
  if (!res.ok) {
    throw new Error(`Jina Search falhou (${res.status}) para "${query}"`);
  }
  const json: any = await res.json();
  const results: any[] = json?.data ?? json?.results ?? [];
  const limit = opts.limit ?? 8;
  return results
    .slice(0, limit)
    .map((r) => ({
      url: r?.url ?? r?.link ?? "",
      title: r?.title ?? "",
      content: r?.content ?? r?.snippet ?? "",
    }))
    .filter((r) => r.url);
}

/**
 * Discover URLs on a site by reading its sitemap(s). Replaces Firecrawl's
 * fc.map(). Handles sitemap indexes (a sitemap that lists other sitemaps).
 *
 * IMPORTANT: the sitemap is fetched THROUGH r.jina.ai, not directly. Many
 * cooking sites (e.g. 24kitchen.pt) sit behind bot protection (Cloudflare) that
 * returns HTTP 403 to any server-side fetch, even with a browser User-Agent.
 * Jina fetches from its own infrastructure and bypasses that block.
 */
export async function discoverUrlsFromSitemap(
  host: string,
  opts: { pathIncludes?: string[]; limit?: number } = {},
): Promise<string[]> {
  const pathIncludes = opts.pathIncludes ?? [];
  const limit = opts.limit ?? 500;
  const origin = new URL(host).origin;

  // Fetch a sitemap through Jina Reader in raw-text mode so the XML survives.
  // Any failure is logged (no more silent empty strings).
  async function fetchXml(u: string): Promise<string> {
    try {
      const res = await fetch(READER_BASE + u, {
        headers: jinaHeaders({ "X-Return-Format": "text" }),
      });
      if (!res.ok) {
        console.error(`[discoverUrls] Jina devolveu ${res.status} para ${u}`);
        return "";
      }
      return await res.text();
    } catch (err) {
      console.error(`[discoverUrls] erro ao ir buscar ${u}:`, err);
      return "";
    }
  }

  // Extract URLs whether they arrive wrapped in <loc>...</loc> (raw XML) or as
  // bare text (Jina's text mode can strip the tags but keeps the URLs).
  function extractLocs(text: string): string[] {
    if (!text) return [];
    const locs: string[] = [];
    const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRe.exec(text)) !== null) locs.push(m[1]);
    if (locs.length === 0) {
      // Fallback: any absolute URL on this origin found in the raw text.
      const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const urlRe = new RegExp(`${escaped}/[^\\s"'<>]+`, "gi");
      let u: RegExpExecArray | null;
      while ((u = urlRe.exec(text)) !== null) locs.push(u[0]);
    }
    return locs;
  }

  // Start from /sitemap.xml; if it's an index, follow the child sitemaps.
  const rootXml = await fetchXml(`${origin}/sitemap.xml`);
  let candidateSitemaps = [`${origin}/sitemap.xml`];
  const rootLocs = extractLocs(rootXml);
  const childSitemaps = rootLocs.filter((l) => /\.xml($|\?)/i.test(l));
  if (childSitemaps.length > 0) candidateSitemaps = childSitemaps;

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const sm of candidateSitemaps) {
    if (urls.length >= limit) break;
    const xml =
      sm === `${origin}/sitemap.xml` && childSitemaps.length === 0 ? rootXml : await fetchXml(sm);
    for (const loc of extractLocs(xml)) {
      if (/\.xml($|\?)/i.test(loc)) continue; // skip nested sitemap entries
      if (seen.has(loc)) continue;
      if (pathIncludes.length > 0 && !pathIncludes.some((p) => loc.includes(p))) continue;
      seen.add(loc);
      urls.push(loc);
      if (urls.length >= limit) break;
    }
  }

  if (urls.length === 0) {
    console.error(
      `[discoverUrls] 0 URLs para ${origin} — verifica o caminho do sitemap e o pathIncludes (${JSON.stringify(
        pathIncludes,
      )})`,
    );
  }
  return urls;
}
