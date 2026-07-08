import { extractRecipeFromMarkdown, persistExtractedRecipe } from "./recipe-extract.server";

export type BulkImportResult = {
  site: string;
  discovered: number;
  imported: number;
  skipped_duplicates: number;
  failed: number;
  errors: Array<{ url: string; error: string }>;
};

export type BulkImportConfig = {
  host: string;
  pathIncludes: string[];
  search?: string | null;
};

const LEGACY_SITE_CONFIG: Record<string, BulkImportConfig> = {
  "24kitchen.pt": {
    host: "https://www.24kitchen.pt",
    pathIncludes: ["/receita/"],
    search: "receita",
  },
  "teleculinaria.pt": {
    host: "https://www.teleculinaria.pt",
    pathIncludes: ["/receita/", "/receitas/"],
    search: "receita",
  },
};

export function getLegacySiteConfig(site: string): BulkImportConfig | null {
  return LEGACY_SITE_CONFIG[site] ?? null;
}

export function siteKeyFromHost(host: string): string {
  try {
    return new URL(host).hostname.replace(/^www\./, "");
  } catch {
    return host.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolve/reject `p` mas nunca demora mais do que `ms`.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout (${ms}ms) em ${label}`)), ms),
    ),
  ]);
}

export async function runBulkImport(params: {
  site: string;
  config: BulkImportConfig;
  limit: number;
  userId: string | null;
  supabase: any;
  // Orçamento de tempo total. Numa background function podes passar, ex., 780000.
  maxMillis?: number;
  // Pausa entre receitas (ms), para respeitar o rate limit do Gemini free tier.
  pauseMs?: number;
}): Promise<BulkImportResult> {
  const { site, config, limit, userId, supabase } = params;
  const maxMillis = params.maxMillis ?? 8500;
  const pauseMs = params.pauseMs ?? 8000; // ~12 receitas/min, dentro do free tier
  const started = Date.now();
  const deadline = started + maxMillis;

  const aiKey = process.env.AI_API_KEY;
  if (!aiKey) throw new Error("AI_API_KEY em falta");

  const { jinaScrape, discoverUrlsFromSitemap } = await import("./jina.server");

  const rawLinks = await discoverUrlsFromSitemap(config.host, {
    pathIncludes: config.pathIncludes,
    limit: 500,
  });
  const includes = config.pathIncludes.length > 0 ? config.pathIncludes : [""];
  const recipeUrls = Array.from(
    new Set(rawLinks.filter((u: string) => includes.some((p) => u.includes(p)))),
  );

  const { data: existing } = await supabase
    .from("recipes")
    .select("source_url")
    .in("source_url", recipeUrls);
  const existingSet = new Set((existing ?? []).map((r: any) => r.source_url));

  const toImport = recipeUrls.filter((u) => !existingSet.has(u)).slice(0, limit);

  const result: BulkImportResult = {
    site,
    discovered: recipeUrls.length,
    imported: 0,
    skipped_duplicates: Math.min(recipeUrls.length, existingSet.size),
    failed: 0,
    errors: [],
  };
  if (toImport.length === 0) return result;

  // Sequencial (concorrência 1) com pausa entre receitas: o gargalo é o rate
  // limit do Gemini, não o tempo — e a background function tem 15 min.
  for (let i = 0; i < toImport.length; i++) {
    const remaining = deadline - Date.now();
    if (remaining <= 8000) break; // reservamos margem para não estourar
    const url = toImport[i];

    try {
      const { markdown, html: rawHtml, metadata } = await withTimeout(
        jinaScrape(url, { includeHtml: true }),
        Math.min(remaining - 2000, 30000),
        url,
      );
      if (!markdown) throw new Error("sem markdown");
      const recipe = await extractRecipeFromMarkdown({ url, markdown, rawHtml, metadata, aiKey });
      await persistExtractedRecipe({ recipe, userId: userId as any, supabase });
      result.imported++;
    } catch (e: any) {
      result.failed++;
      const msg = e?.message ?? String(e);
      result.errors.push({ url, error: msg });
      console.error(`[bulkImport] FALHA ${url}: ${msg}`);
    }

    // Pausa antes da próxima (exceto na última), para não bater no rate limit.
    if (i < toImport.length - 1 && Date.now() + pauseMs < deadline) {
      await sleep(pauseMs);
    }
  }

  console.error(
    `[bulkImport] ${site}: descobertos=${result.discovered} importados=${result.imported} ` +
      `falhas=${result.failed} em ${Date.now() - started}ms (fila restante ~${
        toImport.length - result.imported - result.failed
      })`,
  );

  return result;
}
