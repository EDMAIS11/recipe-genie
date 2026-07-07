import { fetchIngredientPrice } from "./price-fetch.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SITES: Array<"pingodoce.pt" | "continente.pt"> = ["pingodoce.pt", "continente.pt"];

export type PriceUpdateResult = {
  attempted: number;
  updated: number;
  not_found: number;
  failed: number;
  errors: Array<{ ingredient: string; site: string; error: string }>;
};

/**
 * Convert a recipe-ingredient quantity+unit into the ingredient's base unit
 * (g / ml / un). Returns null when conversion isn't possible.
 */
function toBase(quantity: number, unit: string, base: string): number | null {
  const u = unit.toLowerCase().trim();
  const b = base.toLowerCase().trim();
  const map: Record<string, { base: "g" | "ml" | "un"; factor: number }> = {
    kg: { base: "g", factor: 1000 },
    g: { base: "g", factor: 1 },
    gr: { base: "g", factor: 1 },
    l: { base: "ml", factor: 1000 },
    ml: { base: "ml", factor: 1 },
    cl: { base: "ml", factor: 10 },
    un: { base: "un", factor: 1 },
    unidade: { base: "un", factor: 1 },
    unidades: { base: "un", factor: 1 },
    dente: { base: "un", factor: 1 },
    colher_sopa: { base: "ml", factor: 15 },
    colher_cha: { base: "ml", factor: 5 },
  };
  const entry = map[u];
  if (!entry) return null;
  if (entry.base !== b) return null;
  return quantity * entry.factor;
}

export async function updatePricesForIngredient(params: {
  ingredient: { id: string; name: string };
}): Promise<{ updated: number; not_found: number; failed: number; errors: Array<{ site: string; error: string }> }> {
  const { ingredient } = params;
  const supabase = supabaseAdmin;
  const out = { updated: 0, not_found: 0, failed: 0, errors: [] as Array<{ site: string; error: string }> };

  for (const site of SITES) {
    try {
      const price = await fetchIngredientPrice({ ingredientName: ingredient.name, site });

      if (!price) {
        // Não encontrado hoje: mantém o último preço real (is_current=true fica).
        // Regista apenas uma linha de histórico para o RPC saber que já tentámos.
        await supabase.from("ingredient_prices").insert({
          ingredient_id: ingredient.id,
          source_site: site,
          product_name: "NOT_FOUND",
          is_current: false,
        });
        out.not_found++;
        continue;
      }

      // Encontrado: só agora despromove o current anterior e insere o novo.
      await supabase
        .from("ingredient_prices")
        .update({ is_current: false })
        .eq("ingredient_id", ingredient.id)
        .eq("source_site", site)
        .eq("is_current", true);

      await supabase.from("ingredient_prices").insert({
        ingredient_id: ingredient.id,
        source_site: site,
        product_name: price.product_name,
        product_url: price.product_url,
        price_eur: price.price_eur,
        package_quantity: price.package_quantity,
        package_unit: price.package_unit,
        price_per_base_unit: price.price_per_base_unit,
        base_unit: price.base_unit,
        is_current: true,
      });

      // Sync ingredient base_unit if we now know it
      await supabase
        .from("ingredients")
        .update({ base_unit: price.base_unit })
        .eq("id", ingredient.id);

      out.updated++;
    } catch (e: any) {
      out.failed++;
      out.errors.push({ site, error: e?.message ?? String(e) });
    }
  }

  return out;
}

/**
 * Update the N ingredients with the oldest current price (or none at all).
 * Skips ingredients refreshed in the last 7 days.
 */
export async function updateAllPrices(params: {
  limit: number;
}): Promise<PriceUpdateResult> {
  const { limit } = params;
  const supabase = supabaseAdmin;

  const { data: candidates, error } = await supabase.rpc("ingredients_needing_price_refresh", {
    p_limit: limit,
    p_stale_days: 7,
  });
  if (error) throw new Error(error.message);

  const result: PriceUpdateResult = {
    attempted: 0,
    updated: 0,
    not_found: 0,
    failed: 0,
    errors: [],
  };

  for (const ing of candidates ?? []) {
    result.attempted++;
    const r = await updatePricesForIngredient({ ingredient: ing });
    result.updated += r.updated;
    result.not_found += r.not_found;
    result.failed += r.failed;
    for (const e of r.errors) result.errors.push({ ingredient: ing.name, site: e.site, error: e.error });
  }

  return result;
}

/**
 * Recalculate estimated_cost_per_serving for every recipe using cheapest
 * current price per ingredient. Missing prices are skipped (partial cost).
 */
export async function recalculateRecipeCosts(): Promise<{ recipes_updated: number }> {
  const supabase = supabaseAdmin;

  // Get cheapest current price per ingredient across sites
  const { data: prices, error: pErr } = await supabase
    .from("ingredient_prices")
    .select("ingredient_id, price_per_base_unit, base_unit")
    .eq("is_current", true)
    .not("price_per_base_unit", "is", null);
  if (pErr) throw new Error(pErr.message);

  const cheapest = new Map<string, { price: number; base: string }>();
  for (const p of prices ?? []) {
    const prev = cheapest.get(p.ingredient_id);
    if (!prev || p.price_per_base_unit < prev.price) {
      cheapest.set(p.ingredient_id, { price: Number(p.price_per_base_unit), base: p.base_unit ?? "un" });
    }
  }

  const { data: recipes, error: rErr } = await supabase
    .from("recipes")
    .select("id, servings, recipe_ingredients(ingredient_id, quantity, unit)");
  if (rErr) throw new Error(rErr.message);

  let updated = 0;
  for (const r of recipes ?? []) {
    let total = 0;
    for (const ri of r.recipe_ingredients ?? []) {
      const price = cheapest.get(ri.ingredient_id);
      if (!price) continue;
      const qtyBase = toBase(Number(ri.quantity), ri.unit, price.base);
      if (qtyBase == null) continue;
      total += qtyBase * price.price;
    }
    const perServing = r.servings > 0 ? total / r.servings : total;
    const rounded = Math.round(perServing * 100) / 100;
    const { error: uErr } = await supabase
      .from("recipes")
      .update({ estimated_cost_per_serving: rounded })
      .eq("id", r.id);
    if (!uErr) updated++;
  }

  return { recipes_updated: updated };
}
