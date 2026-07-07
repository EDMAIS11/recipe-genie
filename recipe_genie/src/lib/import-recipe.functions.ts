import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  detectSite,
  extractRecipeFromMarkdown,
  persistExtractedRecipe,
  type ExtractedRecipe,
} from "./recipe-extract.server";

const ImportSchema = z.object({ url: z.string().url() });

export const previewImportRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ data }) => {
    const aiKey = process.env.AI_API_KEY;
    if (!aiKey) throw new Error("AI_API_KEY em falta");

    const { jinaScrape } = await import("./jina.server");
    const { markdown, html: rawHtml, metadata } = await jinaScrape(data.url, {
      includeHtml: true,
    });
    if (!markdown) throw new Error("Não foi possível obter conteúdo da página.");

    return extractRecipeFromMarkdown({ url: data.url, markdown, rawHtml, metadata, aiKey });
  });

const SaveSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).nullable(),
  author: z.string().max(120).nullable(),
  source_site: z.string().max(100).nullable(),
  source_url: z.string().url().nullable(),
  servings: z.number().int().min(1).max(50),
  prep_time_min: z.number().int().min(0).max(1440).nullable(),
  cook_time_min: z.number().int().min(0).max(1440).nullable(),
  meal_type: z.string().max(50).nullable(),
  cuisine_style: z.string().max(50).nullable(),
  tags: z.array(z.string().max(40)).max(20),
  calories_per_serving: z.number().int().min(0).max(10000).nullable(),
  image_url: z.string().url().nullable(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        quantity: z.number().min(0).max(100000).nullable(),
        unit: z.string().max(30).nullable(),
        notes: z.string().max(200).nullable(),
      }),
    )
    .max(60),
});

export const saveImportedRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const recipe: ExtractedRecipe = {
      source_url: data.source_url ?? "",
      source_site: data.source_site ?? detectSite(data.source_url ?? ""),
      title: data.title,
      description: data.description,
      author: data.author,
      servings: data.servings,
      prep_time_min: data.prep_time_min,
      cook_time_min: data.cook_time_min,
      meal_type: data.meal_type,
      cuisine_style: data.cuisine_style,
      tags: data.tags,
      calories_per_serving: data.calories_per_serving,
      image_url: data.image_url,
      ingredients: data.ingredients,
    };
    return persistExtractedRecipe({ recipe, userId: context.userId, supabase: context.supabase });
  });
