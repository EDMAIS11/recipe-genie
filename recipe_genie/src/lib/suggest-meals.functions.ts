import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createAiProvider } from "./ai-gateway.server";

type Suggestion = {
  interpretation: string;
  sections: Array<{ section: string; picks: Array<{ recipe_id: string; reason: string }> }>;
};

function parseSuggestion(text: string): Suggestion | null {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  let parsed: any = tryParse(cleaned);
  if (!parsed) {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a >= 0 && b > a) parsed = tryParse(cleaned.slice(a, b + 1));
  }
  if (!parsed || typeof parsed !== "object") return null;
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  return {
    interpretation: typeof parsed.interpretation === "string" ? parsed.interpretation : "",
    sections: sections.map((s: any) => ({
      section: String(s?.section ?? ""),
      picks: Array.isArray(s?.picks)
        ? s.picks
            .filter((p: any) => p && typeof p.recipe_id === "string")
            .map((p: any) => ({ recipe_id: p.recipe_id, reason: String(p.reason ?? "") }))
        : [],
    })),
  };
}


export const suggestMeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ prompt: z.string().min(3).max(1000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Exclude recipes the user marked as excluded; boost favorites in the prompt.
    const { data: prefs } = await context.supabase
      .from("recipe_preferences")
      .select("recipe_id, status")
      .eq("user_id", context.userId);
    const excludedIds = new Set(
      (prefs ?? []).filter((p) => p.status === "excluded").map((p) => p.recipe_id),
    );
    const favoriteIds = new Set(
      (prefs ?? []).filter((p) => p.status === "favorite").map((p) => p.recipe_id),
    );

    const { data: allRecipes, error } = await context.supabase
      .from("recipes")
      .select("id,title,description,meal_type,cuisine_style,tags,servings,estimated_cost_per_serving,calories_per_serving,source_site,source_url,image_url")
      .limit(300);
    if (error) throw new Error(error.message);

    const recipes = (allRecipes ?? []).filter((r) => !excludedIds.has(r.id));

    if (!recipes || recipes.length === 0) {
      return {
        interpretation: "Ainda não tens receitas guardadas (ou estão todas excluídas).",
        sections: [],
        recipes: [],
      };
    }


    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("Missing AI_API_KEY");

    const gateway = createAiProvider(apiKey);
    const model = gateway(process.env.AI_MODEL || "gemini-2.5-flash");

    const catalog = recipes.map((r) => ({
      id: r.id,
      title: r.title,
      meal_type: r.meal_type,
      cuisine: r.cuisine_style,
      tags: r.tags,
      cost_per_serving: r.estimated_cost_per_serving,
      calories: r.calories_per_serving,
      favorite: favoriteIds.has(r.id),
    }));

    const systemPrompt = `És um chef assistente. Sugeres refeições em português a partir de um catálogo de receitas.
Interpretas o pedido (nº pessoas, orçamento POR PESSOA, estilo, exclusões, secções pretendidas).
REGRAS OBRIGATÓRIAS:
- Devolves SEMPRE pelo menos 2 propostas por cada secção pedida, mesmo que tenhas de relaxar o orçamento em até 30% ou o estilo. NUNCA devolvas sections vazio se houver receitas no catálogo.
- Usa o meal_type do catálogo para escolher: "entrada" para entradas, "prato_principal" para pratos principais, "sobremesa" para sobremesas.
- Só podes usar receitas do catálogo fornecido (usa o campo id exatamente como aparece).
- Dá preferência a receitas com favorite=true quando encaixarem.
- Custo é POR PESSOA (cost_per_serving). Compara com o orçamento por pessoa do pedido.
- Se relaxares algum critério, diz-o na interpretation.
- PLANEAMENTO SEMANAL: se o pedido falar em organizar/planear refeições da semana (palavras como "semana", "semanal", "segunda a sexta", "dias úteis", "meal prep"), devolve EXATAMENTE 5 secções com os nomes "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira" (nesta ordem). Se o pedido pedir explicitamente "toda a semana" ou "7 dias" inclui também "Sábado" e "Domingo".
- DUAS OPÇÕES POR TIPO: em cada dia (ou em cada secção genérica pedida), devolve 2 opções POR CADA TIPO de prato relevante. Por defeito num dia semanal: 2 entradas + 2 pratos principais + 2 sobremesas (6 picks por dia). Se o pedido só mencionar "prato principal" ou "almoço rápido", devolve apenas 2 pratos principais. Nunca repitas a mesma receita entre dias.`;

    const userPrompt = `Pedido do utilizador: "${data.prompt}"

Catálogo (${catalog.length} receitas, JSON):
${JSON.stringify(catalog)}

Responde EXCLUSIVAMENTE com um objeto JSON válido (sem markdown, sem \`\`\`), no formato:
{"interpretation": "...", "sections": [{"section": "entrada", "picks": [{"recipe_id": "uuid", "reason": "..."}, ...]}]}`;

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
    });

    const parsed = parseSuggestion(text);
    if (!parsed) {
      return {
        interpretation: "Não foi possível gerar sugestões estruturadas.",
        sections: [],
        recipes,
      };
    }

    const validIds = new Set(recipes.map((r) => r.id));
    const cleanedSections = parsed.sections
      .map((s) => ({
        section: s.section,
        picks: s.picks.filter((p) => validIds.has(p.recipe_id)).slice(0, 8),
      }))
      .filter((s) => s.picks.length > 0);

    return {
      interpretation: parsed.interpretation || "",
      sections: cleanedSections,
      recipes,
    };
  });

