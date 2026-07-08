// Jina Reader client (replaces Firecrawl).
//
// Uses three free/cheap Jina endpoints:
//   - r.jina.ai/<url>   -> clean markdown (and, on a second call, HTML)
//   - s.jina.ai/?q=...  -> web search returning top results with URLs
//   - the target site's sitemap, FETCHED THROUGH r.jina.ai -> URL discovery,
//     with a search-based fallback when the sitemap can't be read.
//
// Set JINA_API_KEY in your environment for higher rate limits.

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
 * Scrape a single page. Returns clean markdown and (optionally) the raw HTML.
 */
export async function jinaScrape(
  url: string,
  opts: { includeHtml?: boolean } = {},
): Promise<{ markdown: string; html: string; metadata: Record<string, unknown> }> {
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
 * Discover recipe URLs on a site. Tries the sitemap first (through r.jina.ai,
 * because a direct fetch is blocked by bot protection), and falls back to a
 * site-scoped web search if the sitemap yields nothing.
 */
export async function discoverUrlsFromSitemap(
  host: string,
  opts: { pathIncludes?: string[]; limit?: number } = {},
): Promise<string[]> {
  const pathIncludes = opts.pathIncludes ?? [];
  const limit = opts.limit ?? 500;
  const origin = new URL(host).origin;
  const bareHost = new URL(host).hostname.replace(/^www\./, "");

  // Fetch through Jina Reader in raw-text mode, logging status + a body snippet
  // so we can SEE what actually comes back when discovery finds nothing.
  async function fetchViaJina(u: string): Promise<string> {
    try {
      const res = await fetch(READER_BASE + u, {
        headers: jinaHeaders({ "X-Return-Format": "text" }),
      });
      const body = res.ok ? await res.text() : "";
      console.error(
        `[discoverUrls] GET ${u} -> status=${res.status} len=${body.length} head=${JSON.stringify(
          body.slice(0, 300),
        )}`,
      );
      return body;
    } catch (err) {
      console.error(`[discoverUrls] erro ao ir buscar ${u}:`, err);
      return "";
    }
  }

  // Extract URLs whether wrapped in <loc>...</loc> or present as bare text.
  function extractLocs(text: string): string[] {
    if (!text) return [];
    const locs: string[] = [];
    const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRe.exec(text)) !== null) locs.push(m[1]);
    if (locs.length === 0) {
      // Fallback: any absolute http(s) URL on this host found in the raw text.
      const escaped = bareHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const urlRe = new RegExp(`https?://[a-z0-9.-]*${escaped}/[^\\s"'<>)\\]]+`, "gi");
      let u: RegExpExecArray | null;
      while ((u = urlRe.exec(text)) !== null) locs.push(u[0]);
    }
    return locs;
  }

  function keep(loc: string): boolean {
    if (/\.xml($|\?)/i.test(loc)) return false;
    if (pathIncludes.length > 0 && !pathIncludes.some((p) => loc.includes(p))) return false;
    return true;
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  const push = (loc: string) => {
    if (urls.length >= limit || seen.has(loc) || !keep(loc)) return;
    seen.add(loc);
    urls.push(loc);
  };

  // 1) Try a few common sitemap locations. Follow one level of sitemap index.
  const rootCandidates = [
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap.xml`,
    `${origin}/wp-sitemap.xml`,
  ];

  for (const root of rootCandidates) {
    if (urls.length >= limit) break;
    const xml = await fetchViaJina(root);
    const locs = extractLocs(xml);
    if (locs.length === 0) continue;

    const childSitemaps = locs.filter((l) => /\.xml($|\?)/i.test(l));
    if (childSitemaps.length > 0) {
      for (const sm of childSitemaps) {
        if (urls.length >= limit) break;
        const childXml = await fetchViaJina(sm);
        for (const loc of extractLocs(childXml)) push(loc);
      }
    } else {
      for (const loc of locs) push(loc);
    }
    if (urls.length > 0) break; // this root worked; stop trying others
  }

  // 2) Fallback: site-scoped search when the sitemap gave us nothing.
  if (urls.length === 0) {
    console.error(`[discoverUrls] sitemap vazio para ${origin} — a tentar pesquisa`);
    const pathHint = pathIncludes[0] ? pathIncludes[0].replace(/\//g, " ") : "receitas";
    try {
      const results = await jinaSearch(`site:${bareHost} ${pathHint}`, { limit: 20 });
      for (const r of results) {
        if (r.url.includes(bareHost)) push(r.url);
      }
      console.error(
        `[discoverUrls] pesquisa devolveu ${results.length} resultados, ${urls.length} úteis`,
      );
    } catch (err) {
      console.error(`[discoverUrls] pesquisa falhou:`, err);
    }
  }

  if (urls.length === 0) {
    console.error(
      `[discoverUrls] 0 URLs para ${origin} (pathIncludes=${JSON.stringify(pathIncludes)})`,
    );
  }
  return urls;
}
