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

export async function runBulkImport(params: {
  site: string;
  config: BulkImportConfig;
  limit: number;
  userId: string;
  supabase: any;
}): Promise<BulkImportResult> {
  const { site, config, limit, userId, supabase } = params;

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

  // Jina has no batch endpoint, so scrape each URL individually. Recipe pages
  // need the raw HTML too (the extractor gates on a Recipe JSON-LD schema).
  for (const url of toImport) {
    try {
      const { markdown, html: rawHtml, metadata } = await jinaScrape(url, {
        includeHtml: true,
      });
      if (!markdown) {
        result.failed++;
        result.errors.push({ url, error: "sem markdown" });
        continue;
      }
      const recipe = await extractRecipeFromMarkdown({ url, markdown, rawHtml, metadata, aiKey });
      await persistExtractedRecipe({ recipe, userId, supabase });
      result.imported++;
    } catch (e: any) {
      result.failed++;
      result.errors.push({ url, error: e?.message ?? String(e) });
    }
  }

  return result;
}
