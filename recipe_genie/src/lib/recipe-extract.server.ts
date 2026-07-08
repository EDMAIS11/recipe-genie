import { generateText } from "ai";
import { createAiProvider } from "./ai-gateway.server";

export type ExtractedRecipe = {
  source_url: string;
  source_site: string;
  title: string;
  description: string | null;
  author: string | null;
  servings: number;
  prep_time_min: number | null;
  cook_time_min: number | null;
  meal_type: string | null;
  cuisine_style: string | null;
  tags: string[];
  calories_per_serving: number | null;
  image_url: string | null;
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
  }>;
};

export function detectSite(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "manual";
  }
}

export function extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(cleaned.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function coerceNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(",", ".").match(/-?\d+(\.\d+)?/);
    if (cleaned) return Number(cleaned[0]);
  }
  return null;
}

export function coerceInt(v: unknown): number | null {
  const n = coerceNumber(v);
  return n == null ? null : Math.round(n);
}

const ALLOWED_MEAL = ["entrada", "prato_principal", "sobremesa", "acompanhamento", "bebida"] as const;
export function normalizeMealType(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim().replace(/\s+/g, "_");
  if ((ALLOWED_MEAL as readonly string[]).includes(s)) return s;
  if (s.includes("entrada")) return "entrada";
  if (s.includes("sobremesa") || s.includes("dessert")) return "sobremesa";
  if (s.includes("acompanha")) return "acompanhamento";
  if (s.includes("bebida") || s.includes("drink")) return "bebida";
  return "prato_principal";
}

export function pickImageFromJsonLd(html: string): string | null {
  const node = findRecipeJsonLd(html);
  if (!node) return null;
  const img = node.image;
  if (typeof img === "string") return img;
  if (Array.isArray(img) && img.length) return typeof img[0] === "string" ? img[0] : img[0]?.url ?? null;
  if (img && typeof img === "object") return img.url ?? null;
  return null;
}

export function pickAuthorFromJsonLd(html: string): string | null {
  const node = findRecipeJsonLd(html);
  if (!node) return null;
  const a = node.author;
  const pick = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "object" && typeof v.name === "string") return v.name.trim() || null;
    return null;
  };
  if (Array.isArray(a)) {
    for (const v of a) {
      const p = pick(v);
      if (p) return p;
    }
    return null;
  }
  return pick(a);
}

function findRecipeJsonLd(html: string): any | null {
  if (!html) return null;
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    try {
      const json = JSON.parse(m[1].trim());
      const nodes: any[] = Array.isArray(json) ? json : json["@graph"] ? json["@graph"] : [json];
      for (const node of nodes) {
        const t = node?.["@type"];
        const isRecipe = t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
        if (isRecipe) return node;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function pickMetaImage(html: string): string | null {
  if (!html) return null;
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

const SYSTEM_PROMPT = `És um extrator de receitas. A partir do markdown de uma página, devolves APENAS um objeto JSON válido em português (sem texto antes ou depois, sem \`\`\`).

Formato exato:
{
  "title": string,
  "description": string | null,
  "author": string | null,
  "servings": number | null,
  "prep_time_min": number | null,
  "cook_time_min": number | null,
  "meal_type": "entrada" | "prato_principal" | "sobremesa" | "acompanhamento" | "bebida" | null,
  "cuisine_style": string | null,
  "tags": string[],
  "calories_per_serving": number | null,
  "ingredients": [{ "name": string, "quantity": number | null, "unit": string | null, "notes": string | null }]
}

Regras:
- title limpo, sem prefixos de site.
- author: nome do chefe/autor da receita se identificado explicitamente na página (ex.: "Henrique Sá Pessoa"). Se for só o nome do site/portal, deixa null.
- tags: 3-8 palavras curtas (verao, vegetariano, forno, rápido...).
- ingredients: nome no singular, quantidade numérica se possível, unit em g/ml/un/colher_sopa/colher_cha/dente.
- Se não souberes, usa null (ou [] para tags/ingredients).`;

export async function extractRecipeFromMarkdown(params: {
  url: string;
  markdown: string;
  rawHtml: string;
  metadata: any;
  aiKey: string;
}): Promise<ExtractedRecipe> {
  const { url, markdown, rawHtml, metadata, aiKey } = params;

  // JSON-LD é usado como BÓNUS (imagem/autor) quando existe — mas NÃO como
  // porteiro. O Jina devolve HTML limpo para leitura e costuma remover os
  // <script>, incluindo o ld+json, por isso exigi-lo rejeitaria páginas de
  // receita legítimas. A descoberta já filtra por caminho (/receita/), e mais
  // abaixo validamos o RESULTADO da extração (título + ingredientes) para
  // apanhar eventuais páginas-índice.
  const hasJsonLd = !!findRecipeJsonLd(rawHtml);

  const jsonLdImage = pickImageFromJsonLd(rawHtml);
  const jsonLdAuthor = pickAuthorFromJsonLd(rawHtml);
  const htmlOgImage = pickMetaImage(rawHtml);
  const metaImage: string | null =
    jsonLdImage ??
    htmlOgImage ??
    metadata?.ogImage ??
    metadata?.["og:image"] ??
    metadata?.og?.image ??
    null;

  const gateway = createAiProvider(aiKey);
  const model = gateway(process.env.AI_MODEL || "gemini-2.5-flash");

  let text = "";
  try {
    const out = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `URL: ${url}\n\nMarkdown:\n${markdown.slice(0, 15000)}`,
    });
    text = out.text;
  } catch (err: any) {
    console.error(`[extract] falha na chamada ao modelo para ${url}:`, err?.message ?? err);
    throw new Error(`Chamada ao modelo falhou: ${err?.message ?? String(err)}`);
  }

  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    console.error(
      `[extract] resposta não-JSON para ${url} (len=${text?.length ?? 0}) head=${JSON.stringify(
        (text ?? "").slice(0, 200),
      )}`,
    );
    throw new Error("Não foi possível extrair a receita (resposta não-JSON).");
  }

  const ingredientsRaw = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
  const ingredients = ingredientsRaw
    .filter((i: any) => i && typeof i.name === "string" && i.name.trim())
    .slice(0, 60)
    .map((i: any) => ({
      name: String(i.name).trim().slice(0, 120),
      quantity: coerceNumber(i.quantity),
      unit: i.unit ? String(i.unit).trim().slice(0, 30) : null,
      notes: i.notes ? String(i.notes).trim().slice(0, 200) : null,
    }));

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((t: any) => typeof t === "string" && t.trim())
        .slice(0, 15)
        .map((t: string) => t.trim().slice(0, 40))
    : [];

  const aiAuthor =
    typeof parsed.author === "string" && parsed.author.trim()
      ? parsed.author.trim().slice(0, 120)
      : null;

  const title =
    typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null;

  // Validação de resultado: uma página de receita real tem título e alguns
  // ingredientes. Se não tiver, é quase de certeza uma página-índice/coleção.
  if (!title || ingredients.length < 2) {
    throw new Error(
      `Não parece uma receita (título=${title ? "sim" : "não"}, ingredientes=${ingredients.length}${
        hasJsonLd ? "" : ", sem JSON-LD"
      }).`,
    );
  }

  return {
    source_url: url,
    source_site: detectSite(url),
    title: title.slice(0, 200),
    description: typeof parsed.description === "string" ? parsed.description.trim() : null,
    author: (jsonLdAuthor ?? aiAuthor)?.slice(0, 120) ?? null,
    servings: coerceInt(parsed.servings) ?? 4,
    prep_time_min: coerceInt(parsed.prep_time_min),
    cook_time_min: coerceInt(parsed.cook_time_min),
    meal_type: normalizeMealType(parsed.meal_type),
    cuisine_style: typeof parsed.cuisine_style === "string" ? parsed.cuisine_style.trim() : null,
    tags,
    calories_per_serving: coerceInt(parsed.calories_per_serving),
    image_url: metaImage,
    ingredients,
  };
}

export async function persistExtractedRecipe(params: {
  recipe: ExtractedRecipe;
  userId: string;
  supabase: any;
}): Promise<{ id: string }> {
  const { recipe, userId, supabase } = params;

  const isJamieOliverAuthor = /jamie\s+oliver|oliver\s+jamie/i.test(recipe.author ?? "");
  const isOfficialJamieOliverSource = /(^|\.)jamieoliver\.com$/i.test(recipe.source_site);
  if (isJamieOliverAuthor && !isOfficialJamieOliverSource) {
    throw new Error("Receita Jamie Oliver ignorada fora da fonte oficial.");
  }

  const { data: inserted, error } = await supabase
    .from("recipes")
    .insert({
      title: recipe.title,
      description: recipe.description,
      author: recipe.author,
      source_site: recipe.source_site,
      source_url: recipe.source_url,
      servings: recipe.servings,
      prep_time_min: recipe.prep_time_min,
      cook_time_min: recipe.cook_time_min,
      meal_type: recipe.meal_type,
      cuisine_style: recipe.cuisine_style,
      tags: recipe.tags,
      calories_per_serving: recipe.calories_per_serving,
      image_url: recipe.image_url,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    // Unique-violation on source_url means another concurrent import
    // already saved this recipe. Return the existing id instead of throwing.
    if ((error as any).code === "23505" && recipe.source_url) {
      const { data: existingRow } = await supabase
        .from("recipes")
        .select("id")
        .eq("source_url", recipe.source_url)
        .maybeSingle();
      if (existingRow?.id) return { id: existingRow.id };
    }
    console.error(`[persist] erro Supabase ao inserir ${recipe.source_url}:`, error.message);
    throw new Error(error.message);
  }

  if (recipe.ingredients.length > 0) {
    const names = Array.from(new Set(recipe.ingredients.map((i) => i.name.trim().toLowerCase())));
    const { data: existing } = await supabase
      .from("ingredients")
      .select("id,name")
      .in("name", names);

    const existingMap = new Map((existing ?? []).map((i: any) => [i.name.toLowerCase(), i.id]));
    const missing = names.filter((n) => !existingMap.has(n));

    if (missing.length > 0) {
      const { data: insIngs, error: insErr } = await supabase
        .from("ingredients")
        .insert(missing.map((n) => ({ name: n, base_unit: "g" })))
        .select("id,name");
      if (insErr) throw new Error(insErr.message);
      for (const row of insIngs ?? []) existingMap.set(row.name.toLowerCase(), row.id);
    }

    const rows = recipe.ingredients
      .map((i) => ({
        recipe_id: inserted.id,
        ingredient_id: existingMap.get(i.name.trim().toLowerCase())!,
        quantity: i.quantity ?? 0,
        unit: i.unit ?? "g",
        notes: i.notes,
      }))
      .filter((r) => r.ingredient_id);

    if (rows.length > 0) {
      const { error: linkErr } = await supabase.from("recipe_ingredients").insert(rows);
      if (linkErr) throw new Error(linkErr.message);
    }
  }

  return { id: inserted.id };
}
