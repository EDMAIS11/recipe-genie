import { generateText } from "ai";
import { createAiProvider } from "./ai-gateway.server";
import { jinaScrape, jinaSearch } from "./jina.server";

export type PriceInfo = {
  product_name: string;
  product_url: string;
  price_eur: number;
  package_quantity: number;
  package_unit: string; // g | ml | un
  price_per_base_unit: number;
  base_unit: string; // g | ml | un
};

function normalizeUnit(unit: string): { base: "g" | "ml" | "un"; factor: number } {
  const u = unit.toLowerCase().trim();
  if (["kg", "kilo", "kilograma", "quilo"].includes(u)) return { base: "g", factor: 1000 };
  if (["g", "gr", "grama", "gramas"].includes(u)) return { base: "g", factor: 1 };
  if (["l", "lt", "litro", "litros"].includes(u)) return { base: "ml", factor: 1000 };
  if (["cl"].includes(u)) return { base: "ml", factor: 10 };
  if (["ml", "mililitro"].includes(u)) return { base: "ml", factor: 1 };
  return { base: "un", factor: 1 };
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(cleaned.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

type SiteKey = "pingodoce.pt" | "continente.pt";

// Per site: search query template + whitelist of URL substrings that indicate
// an actual product page (not a recipe/category/news page).
const SITE_CONFIG: Record<SiteKey, {
  buildQuery: (term: string) => string;
  isProductUrl: (url: string) => boolean;
}> = {
  "pingodoce.pt": {
    // Searching site:pingodoce.pt returns mostly recipes; a plain query surfaces
    // product URLs at pingodoce.pt/home/produtos/… and mercadao.pt/store/pingo-doce/product/…
    buildQuery: (t) => `${t} pingo doce comprar preço`,
    isProductUrl: (url) =>
      /pingodoce\.pt\/home\/produtos\//i.test(url) ||
      /mercadao\.pt\/store\/pingo-doce\/product\//i.test(url),
  },
  "continente.pt": {
    buildQuery: (t) => `${t} continente comprar preço`,
    isProductUrl: (url) => /www\.continente\.pt\/produto\//i.test(url),
  },
};

/**
 * Search a supermarket via Jina for the ingredient, scrape the top result,
 * ask the AI to extract price+package, and return normalized €/base_unit.
 * Returns null when nothing usable was found.
 */
export async function fetchIngredientPrice(params: {
  ingredientName: string;
  site: SiteKey;
}): Promise<PriceInfo | null> {
  const { ingredientName, site } = params;
  const aiKey = process.env.AI_API_KEY;
  if (!aiKey) throw new Error("AI_API_KEY em falta");

  const cfg = SITE_CONFIG[site];
  const query = cfg.buildQuery(ingredientName);

  let candidateUrl: string | null = null;
  try {
    const results = await jinaSearch(query, { limit: 8 });
    for (const r of results) {
      if (!r.url) continue;
      if (!cfg.isProductUrl(r.url)) continue;
      candidateUrl = r.url;
      break;
    }
  } catch {
    return null;
  }

  if (!candidateUrl) return null;

  let markdown = "";
  try {
    const scrape = await jinaScrape(candidateUrl);
    markdown = scrape.markdown;
  } catch {
    return null;
  }
  if (!markdown) return null;

  const gateway = createAiProvider(aiKey);
  const model = gateway(process.env.AI_MODEL || "gemini-2.5-flash");

  const system = `És um extrator de preços de produtos alimentares num supermercado português.
Devolves APENAS um objeto JSON válido (sem \`\`\`), sem texto extra.

Formato:
{
  "product_name": string,
  "price_eur": number,          // preço final em euros (ex.: 1.29)
  "package_quantity": number,   // ex.: 500 (para 500 g) ou 1 (para 1 un)
  "package_unit": "g" | "kg" | "ml" | "l" | "un"
}

Regras:
- Se o produto NÃO corresponde ao ingrediente pedido, devolve {"error": "no_match"}.
- Se não conseguires ler o preço, devolve {"error": "no_price"}.
- Usa ponto decimal.`;

  const { text } = await generateText({
    model,
    system,
    prompt: `Ingrediente pesquisado: "${ingredientName}"
URL: ${candidateUrl}

Markdown:
${markdown.slice(0, 8000)}`,
  });

  const parsed = extractJson(text);
  if (!parsed || parsed.error) return null;

  const price = Number(parsed.price_eur);
  const qty = Number(parsed.package_quantity);
  const unitRaw = String(parsed.package_unit ?? "un");
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const { base, factor } = normalizeUnit(unitRaw);
  const baseQty = qty * factor;
  const perBase = price / baseQty;

  return {
    product_name: String(parsed.product_name ?? ingredientName).slice(0, 200),
    product_url: candidateUrl,
    price_eur: Math.round(price * 100) / 100,
    package_quantity: qty,
    package_unit: unitRaw,
    price_per_base_unit: Math.round(perBase * 10000) / 10000,
    base_unit: base,
  };
}
