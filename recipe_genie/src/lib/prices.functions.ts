import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { PriceUpdateResult } from "./price-update.server";

const RunSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

export const runPriceUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunSchema.parse(input))
  .handler(async ({ data, context }): Promise<PriceUpdateResult & { recipes_updated: number }> => {
    const { updateAllPrices, recalculateRecipeCosts } = await import("./price-update.server");
    const result = await updateAllPrices({ limit: data.limit });
    const { recipes_updated } = await recalculateRecipeCosts();
    return { ...result, recipes_updated };
  });

export const listPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ings, error } = await context.supabase
      .from("ingredients")
      .select("id, name, base_unit, ingredient_prices(source_site, price_eur, price_per_base_unit, base_unit, product_name, product_url, fetched_at, is_current)")
      .order("name");
    if (error) throw new Error(error.message);
    return (ings ?? []).map((i: any) => {
      const rows = (i.ingredient_prices ?? []) as any[];
      const pick = (site: string) => {
        const perSite = rows.filter((p) => p.source_site === site);
        // Prefer the current real-price row; otherwise show the latest attempt
        // (typically NOT_FOUND) so the user knows we tried.
        const cur = perSite.find((p) => p.is_current && p.price_eur != null);
        if (cur) return cur;
        perSite.sort((a, b) => (a.fetched_at < b.fetched_at ? 1 : -1));
        return perSite[0] ?? null;
      };
      return {
        id: i.id,
        name: i.name,
        base_unit: i.base_unit,
        pingodoce: pick("pingodoce.pt"),
        continente: pick("continente.pt"),
      };
    });
  });
