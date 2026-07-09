// Jina Reader client (replaces Firecrawl).
//
// Uses three free/cheap Jina endpoints:
//   - r.jina.ai/<url>   -> clean markdown (and, on a second call, HTML)
//   - s.jina.ai/?q=...  -> web search returning top results with URLs
//   - the target site's sitemap: tries a DIRECT https.get first (free — no Jina
//     tokens), falling back to r.jina.ai and then to search only if that fails.
//
// Set JINA_API_KEY in your environment for higher rate limits.

import https from "node:https";

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
  const bareHost = new URL(host).hostname.replace(/^www\./, "");
  const escapedHost = bareHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Prefer the www host: 24kitchen.pt redirects the bare host to www, so hitting
  // www directly avoids a redirect hop on every discovery request.
  const parsed = new URL(host);
  if (!parsed.hostname.startsWith("www.")) parsed.hostname = "www." + bareHost;
  const origin = parsed.origin;

  // Fetch a URL DIRECTLY, bypassing Jina entirely. Uses a browser user-agent and
  // rejectUnauthorized:false (24kitchen.pt has a cert that doesn't validate on the
  // normal chain). Follows up to 5 redirects — 24kitchen.pt redirects the bare
  // host (24kitchen.pt) to www.24kitchen.pt, and https.get does NOT follow
  // redirects on its own. When this works, URL discovery costs ZERO Jina tokens.
  function fetchDirect(u: string, redirectsLeft = 5): Promise<string> {
    return new Promise((resolve) => {
      const req = https.get(
        u,
        {
          rejectUnauthorized: false,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;

          // Follow redirects (301/302/303/307/308).
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume(); // drain
            if (redirectsLeft <= 0) {
              console.error(`[discoverUrls] fetchDirect ${u}: demasiados redirects`);
              resolve("");
              return;
            }
            const next = new URL(res.headers.location, u).href;
            resolve(fetchDirect(next, redirectsLeft - 1));
            return;
          }

          if (status < 200 || status >= 300) {
            console.error(`[discoverUrls] fetchDirect ${u}: HTTP ${status}`);
            res.resume();
            resolve("");
            return;
          }

          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve(body));
        },
      );
      req.on("error", (err) => {
        console.error(`[discoverUrls] fetchDirect ${u}: erro ${err?.message ?? err}`);
        resolve("");
      });
      req.setTimeout(15000, () => {
        req.destroy();
        console.error(`[discoverUrls] fetchDirect ${u}: timeout`);
        resolve("");
      });
    });
  }

  async function fetchViaJina(u: string): Promise<string> {
    // 1) Try a direct fetch first — free, no Jina tokens spent.
    const direct = await fetchDirect(u);
    const looksLikeChallenge =
      /just a moment|checking your browser|cf-browser-verification/i.test(direct);
    if (direct && !looksLikeChallenge) {
      console.error(
        `[discoverUrls] GET (directo) ${u} -> len=${direct.length} (sem Jina)`,
      );
      return direct;
    }

    // 2) Fall back to Jina Reader (costs tokens) only if the direct fetch failed.
    try {
      const res = await fetch(READER_BASE + u, {
        headers: jinaHeaders({ "X-Return-Format": "text" }),
      });
      const body = res.ok ? await res.text() : "";
      console.error(
        `[discoverUrls] GET (via Jina) ${u} -> status=${res.status} len=${body.length} head=${JSON.stringify(
          body.slice(0, 200),
        )}`,
      );
      return body;
    } catch (err) {
      console.error(`[discoverUrls] erro ao ir buscar ${u}:`, err);
      return "";
    }
  }

  // Extract URLs. Handles two shapes:
  //   a) proper XML with <loc>...</loc> tags;
  //   b) Jina's text mode, which strips tags AND whitespace, gluing each URL to
  //      the lastmod/changefreq/priority that followed it, e.g.
  //        https://www.24kitchen.pt/receita/x2026-05-19weekly0.8https://...
  //      We match each URL lazily and cut it where the next token begins: a
  //      lastmod date (YYYY-MM-DD), the next https://, whitespace, or end.
  function extractLocs(text: string): string[] {
    if (!text) return [];
    const locs: string[] = [];

    const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRe.exec(text)) !== null) locs.push(m[1]);
    if (locs.length > 0) return locs;

    const urlRe = new RegExp(
      `https?://[a-z0-9.-]*${escapedHost}/[^\\s"'<>)\\]]*?(?=\\d{4}-\\d{2}-\\d{2}|https?://|[\\s"'<>)\\]]|$)`,
      "gi",
    );
    let u: RegExpExecArray | null;
    while ((u = urlRe.exec(text)) !== null) {
      if (u[0]) locs.push(u[0]);
      if (u.index === urlRe.lastIndex) urlRe.lastIndex++; // guard against zero-length matches
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

  // 1) Try common sitemap locations. sitemap.xml first — confirmed to work for
  //    24kitchen.pt. Follow one level of sitemap index when present.
  const rootCandidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
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
        for (const loc of extractLocs(await fetchViaJina(sm))) push(loc);
      }
    } else {
      for (const loc of locs) push(loc);
    }
    if (urls.length > 0) break; // this root worked
  }

  // 2) Fallback: site-scoped search when the sitemap gave us nothing.
  if (urls.length === 0) {
    console.error(`[discoverUrls] sitemap sem URLs úteis para ${origin} — a tentar pesquisa`);
    const pathHint = pathIncludes[0] ? pathIncludes[0].replace(/\//g, " ").trim() : "receitas";
    try {
      const results = await jinaSearch(`site:${bareHost} ${pathHint}`, { limit: 20 });
      for (const r of results) if (r.url.includes(bareHost)) push(r.url);
      console.error(
        `[discoverUrls] pesquisa: ${results.length} resultados, ${urls.length} úteis`,
      );
    } catch (err) {
      console.error(`[discoverUrls] pesquisa falhou:`, err);
    }
  }

  console.error(`[discoverUrls] total ${urls.length} URLs para ${origin}`);
  return urls;
}
