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

// Resolve/reject `p` but never take longer than `ms`. The underlying request
// keeps running in the background if it loses the race, but it is abandoned
// once the function returns — the important thing is that we return in time.
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
  userId: string;
  supabase: any;
  // Orçamento de tempo total. Default seguro para uma função síncrona do
  // Netlify (limite 10s). Numa background function podes passar, ex., 800000.
  maxMillis?: number;
}): Promise<BulkImportResult> {
  const { site, config, limit, userId, supabase } = params;
  const maxMillis = params.maxMillis ?? 8500;
  const CONCURRENCY = 3; // scrapes em paralelo por lote (conservador p/ o Jina)
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

  async function importOne(url: string, budgetMs: number): Promise<void> {
    const { markdown, html: rawHtml, metadata } = await jinaScrape(url, {
      includeHtml: true,
    });
    if (!markdown) throw new Error("sem markdown");
    const recipe = await extractRecipeFromMarkdown({ url, markdown, rawHtml, metadata, aiKey });
    await persistExtractedRecipe({ recipe, userId, supabase });
  }

  // Processa em lotes concorrentes, parando quando o orçamento de tempo acaba.
  // O que não for importado nesta corrida fica para a próxima (o agendador de
  // 30 min continua a esgotar a fila, e os duplicados já são ignorados).
  for (let i = 0; i < toImport.length; i += CONCURRENCY) {
    const remaining = deadline - Date.now();
    if (remaining <= 1500) break; // não vale a pena começar outro lote
    const batch = toImport.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      batch.map((url) => withTimeout(importOne(url, remaining), remaining, url)),
    );

    settled.forEach((s, idx) => {
      if (s.status === "fulfilled") {
        result.imported++;
      } else {
        result.failed++;
        const msg = s.reason?.message ?? String(s.reason);
        result.errors.push({ url: batch[idx], error: msg });
        console.error(`[bulkImport] FALHA ${batch[idx]}: ${msg}`);
      }
    });
  }

  console.error(
    `[bulkImport] ${site}: descobertos=${result.discovered} importados=${result.imported} ` +
      `falhas=${result.failed} em ${Date.now() - started}ms (fila restante ~${
        toImport.length - result.imported - result.failed
      })`,
  );

  return result;
}
