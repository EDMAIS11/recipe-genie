import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createAiProvider } from "./ai-gateway.server";

type Suggestion = {
  interpretation: string;
  sections: Array<{
    section: string;
    picks: Array<{ recipe_id: string; reason: string }>;
  }>;
};

function parseSuggestion(text: string): Suggestion | null {
  if (!text) return null;

  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const tryParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  let parsed: any = tryParse(cleaned);

  if (!parsed) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = tryParse(cleaned.slice(firstBrace, lastBrace + 1));
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];

  return {
    interpretation:
      typeof parsed.interpretation === "string"
        ? parsed.interpretation
        : "",
    sections: sections.map((section: any) => ({
      section: String(section?.section ?? ""),
      picks: Array.isArray(section?.picks)
        ? section.picks
            .filter(
              (pick: any) =>
                pick && typeof pick.recipe_id === "string",
            )
            .map((pick: any) => ({
              recipe_id: pick.recipe_id,
              reason: String(pick.reason ?? ""),
            }))
        : [],
    })),
  };
}

function selectRecipesForAi<
  T extends {
    id: string;
    title?: string | null;
    meal_type?: string | null;
  },
>(recipes: T[], favoriteIds: Set<string>): T[] {
  const ordered = [...recipes].sort((left, right) => {
    const favoriteDifference =
      Number(favoriteIds.has(right.id)) -
      Number(favoriteIds.has(left.id));

    if (favoriteDifference !== 0) return favoriteDifference;

    return String(left.title ?? "").localeCompare(
      String(right.title ?? ""),
      "pt",
    );
  });

  const selected: T[] = [];
  const selectedIds = new Set<string>();

  const addRecipes = (candidates: T[], limit: number) => {
    for (const recipe of candidates) {
      if (selected.length >= 120 || limit <= 0) break;
      if (selectedIds.has(recipe.id)) continue;

      selected.push(recipe);
      selectedIds.add(recipe.id);
      limit -= 1;
    }
  };

  // Mantém variedade suficiente para os três tipos usados no plano semanal.
  for (const mealType of [
    "entrada",
    "prato_principal",
    "sobremesa",
  ]) {
    addRecipes(
      ordered.filter((recipe) => recipe.meal_type === mealType),
      35,
    );
  }

  // Preenche os lugares restantes com bebidas, acompanhamentos, snacks
  // ou mais receitas dos tipos principais.
  addRecipes(ordered, 120 - selected.length);

  return selected;
}

function friendlyAiError(error: unknown): Error {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "");

  if (
    /timeout|timed out|deadline|aborted|504|gateway/i.test(rawMessage)
  ) {
    return new Error(
      "A geração demorou demasiado. Tenta novamente; o plano semanal será gerado um dia de cada vez.",
    );
  }

  if (/<html|inactivity timeout/i.test(rawMessage)) {
    return new Error(
      "O servidor não conseguiu concluir a geração dentro do tempo permitido.",
    );
  }

  return new Error(
    rawMessage || "Não foi possível obter sugestões da IA.",
  );
}

export const suggestMeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(1000),
        targetSection: z.string().min(2).max(50).optional(),
        excludeRecipeIds: z
          .array(z.string().min(1).max(100))
          .max(100)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: preferences } = await context.supabase
      .from("recipe_preferences")
      .select("recipe_id, status")
      .eq("user_id", context.userId);

    const excludedIds = new Set<string>([
      ...(preferences ?? [])
        .filter((preference) => preference.status === "excluded")
        .map((preference) => preference.recipe_id),
      ...(data.excludeRecipeIds ?? []),
    ]);

    const favoriteIds = new Set(
      (preferences ?? [])
        .filter((preference) => preference.status === "favorite")
        .map((preference) => preference.recipe_id),
    );

    const { data: allRecipes, error } = await context.supabase
      .from("recipes")
      .select(
        "id,title,meal_type,cuisine_style,tags,estimated_cost_per_serving,calories_per_serving,source_url,image_url",
      )
      .limit(300);

    if (error) throw new Error(error.message);

    const availableRecipes = (allRecipes ?? []).filter(
      (recipe) => !excludedIds.has(recipe.id),
    );

    if (availableRecipes.length === 0) {
      return {
        interpretation:
          "Ainda não tens receitas disponíveis para este pedido.",
        sections: [],
        recipes: [],
      };
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("Missing AI_API_KEY");

    const gateway = createAiProvider(apiKey);
    const model = gateway(
      process.env.AI_MODEL || "gemini-2.5-flash",
    );

    // A IA recebe no máximo 120 receitas, em vez das 300 completas.
    const recipes = selectRecipesForAi(
      availableRecipes,
      favoriteIds,
    );

    const catalog = recipes.map((recipe) => ({
      id: recipe.id,
      title: recipe.title,
      meal_type: recipe.meal_type,
      cuisine: recipe.cuisine_style,
      tags: recipe.tags,
      cost_per_serving: recipe.estimated_cost_per_serving,
      calories: recipe.calories_per_serving,
      favorite: favoriteIds.has(recipe.id),
    }));

    const planningRules = data.targetSection
      ? `MODO DE GERAÇÃO PARCIAL:
- Gera APENAS o dia/secção "${data.targetSection}".
- Devolve EXATAMENTE uma secção com o nome "${data.targetSection}".
- Não devolvas os restantes dias da semana.
- Por defeito, nesse dia devolve 2 entradas + 2 pratos principais + 2 sobremesas.
- Se o pedido original limitar explicitamente os tipos de prato, respeita essa limitação.
- As receitas usadas em dias anteriores já foram removidas do catálogo; não inventes IDs.`
      : `PLANEAMENTO SEMANAL:
- Se o pedido falar em organizar/planear refeições da semana (por exemplo "semana", "semanal", "segunda a sexta", "dias úteis" ou "meal prep"), devolve EXATAMENTE 5 secções: "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira" e "Sexta-feira", nesta ordem.
- Se o pedido disser explicitamente "toda a semana", "7 dias", "sete dias" ou "segunda a domingo", inclui também "Sábado" e "Domingo".
- Em cada dia devolve, por defeito, 2 entradas + 2 pratos principais + 2 sobremesas.
- Se o pedido só mencionar um tipo, como "prato principal" ou "almoço rápido", devolve apenas 2 pratos principais.
- Nunca repitas a mesma receita entre dias.`;

    const systemPrompt = `És um chef assistente. Sugeres refeições em português de Portugal a partir de um catálogo de receitas.

Interpretas o pedido: número de pessoas, orçamento POR PESSOA, estilo, exclusões e tipos de prato pretendidos.

REGRAS OBRIGATÓRIAS:
- Devolve pelo menos 2 propostas por cada tipo de prato pedido, desde que existam receitas desse tipo no catálogo.
- Podes relaxar o orçamento em até 30% ou o estilo, mas tens de indicar isso na interpretation.
- Usa meal_type="entrada" para entradas, meal_type="prato_principal" para pratos principais e meal_type="sobremesa" para sobremesas.
- Só podes usar receitas do catálogo fornecido.
- Copia o campo id exatamente como aparece no catálogo.
- Dá preferência a favorite=true quando a receita cumprir o pedido.
- cost_per_serving é sempre o custo POR PESSOA.
- Não inventes receitas, preços, calorias nem IDs.
- Não devolvas uma secção vazia quando existirem receitas adequadas no catálogo.

${planningRules}`;

    const expectedSection = data.targetSection ?? "entrada";

    const userPrompt = `Pedido original do utilizador:
"${data.prompt}"

${data.targetSection ? `Parte a gerar agora: "${data.targetSection}"` : ""}

Catálogo (${catalog.length} receitas, JSON):
${JSON.stringify(catalog)}

Responde EXCLUSIVAMENTE com um objeto JSON válido, sem markdown e sem blocos de código, neste formato:
{"interpretation":"...","sections":[{"section":"${expectedSection}","picks":[{"recipe_id":"uuid","reason":"..."}]}]}`;

    let text: string;

    try {
      const generated = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.25,
        maxOutputTokens: data.targetSection ? 1200 : 1800,
        maxRetries: 1,
        timeout: 45_000,
      });

      text = generated.text;
    } catch (error) {
      throw friendlyAiError(error);
    }

    const parsed = parseSuggestion(text);

    if (!parsed) {
      return {
        interpretation:
          "Não foi possível interpretar a resposta da IA.",
        sections: [],
        recipes,
      };
    }

    const validIds = new Set(recipes.map((recipe) => recipe.id));

    const cleanedSections = parsed.sections
      .map((section) => ({
        section: data.targetSection || section.section,
        picks: section.picks
          .filter((pick) => validIds.has(pick.recipe_id))
          .slice(0, 8),
      }))
      .filter((section) => section.picks.length > 0);

    return {
      interpretation: parsed.interpretation || "",
      sections: cleanedSections,
      recipes,
    };
  });
