import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type RecipePrefStatus = "favorite" | "excluded";

export const listMyRecipePreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("recipe_preferences")
      .select("recipe_id, status")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ recipe_id: string; status: RecipePrefStatus }>;
  });

const SetSchema = z.object({
  recipe_id: z.string().uuid(),
  status: z.enum(["favorite", "excluded"]).nullable(),
});

export const setRecipePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.status === null) {
      const { error } = await context.supabase
        .from("recipe_preferences")
        .delete()
        .eq("user_id", context.userId)
        .eq("recipe_id", data.recipe_id);
      if (error) throw new Error(error.message);
      return { ok: true, status: null as RecipePrefStatus | null };
    }
    const { error } = await context.supabase
      .from("recipe_preferences")
      .upsert(
        { user_id: context.userId, recipe_id: data.recipe_id, status: data.status },
        { onConflict: "user_id,recipe_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, status: data.status };
  });
