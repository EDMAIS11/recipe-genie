import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Defaults mostrados no ecrã e usados quando não há linha guardada.
// TEM de ficar igual à constante em suggest-meals.functions.ts.
export const DEFAULT_USER_PREFS =
  "Relaxa o orçamento até 30% acima do limite se valer a pena. Dá preferência às minhas receitas favoritas. Varia bastante as escolhas ao longo da semana.";

export const getUserPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_suggestion_prefs")
      .select("prefs_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const prefsText = (data?.prefs_text ?? "").trim();

    return {
      prefsText: prefsText || DEFAULT_USER_PREFS,
      isDefault: prefsText.length === 0,
    };
  });

export const saveUserPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prefsText: z.string().max(1500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const prefsText = data.prefsText.trim();

    const { error } = await context.supabase
      .from("user_suggestion_prefs")
      .upsert(
        {
          user_id: context.userId,
          prefs_text: prefsText,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (error) throw new Error(error.message);

    return { ok: true, prefsText: prefsText || DEFAULT_USER_PREFS };
  });
