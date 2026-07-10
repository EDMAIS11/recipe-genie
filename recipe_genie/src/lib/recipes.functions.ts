import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const PAGE = 1000;
    let from = 0;
    const all = [];
    for (;;) {
      const { data, error } = await context.supabase
        .from("recipes")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  });

const CreateRecipeSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional().nullable(),
  source_site: z.string().max(100).optional().nullable(),
  source_url: z.string().url().optional().nullable(),
  servings: z.number().int().min(1).max(50),
  prep_time_min: z.number().int().min(0).max(1440).optional().nullable(),
  cook_time_min: z.number().int().min(0).max(1440).optional().nullable(),
  meal_type: z.string().max(50).optional().nullable(),
  cuisine_style: z.string().max(50).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  calories_per_serving: z.number().int().min(0).max(10000).optional().nullable(),
  estimated_cost_per_serving: z.number().min(0).max(1000).optional().nullable(),
  image_url: z.string().url().optional().nullable(),
});

export const createRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateRecipeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("recipes")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("recipes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
