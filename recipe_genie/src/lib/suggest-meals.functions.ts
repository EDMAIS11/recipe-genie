import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createAiProvider } from "./ai-gateway.server";

// Preferências de gosto por defeito, usadas quando o utilizador ainda não
// definiu as suas. TEM de ficar igual à constante em user-prefs.functions.ts.
const DEFAULT_USER_PREFS =
  "Relaxa o orçamento até 30% acima do limite se valer a pena. Dá preferência às minhas receitas favoritas. Varia bastante as escolhas ao longo da semana.";

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

// ---------------------------------------------------------------------------
// Amostragem aleatória e temas semanais
// ---------------------------------------------------------------------------

type PoolRecipe = {
  id: string;
  title: string | null;
  meal_type: string | null;
  tags: string[] | null;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Palavras-chave por tema (alinhadas com a árvore de categorias da app).
const THEME_KEYWORDS: Record<string, string[]> = {
  peixe: [
    "peixe", "bacalhau", "salmao", "atum", "polvo", "choco", "lulas",
    "camarao", "marisco", "sardinha", "dourada", "robalo", "pescada",
    "mexilh", "ameijoa", "gambas", "lagosta", "truta", "tamboril",
    "carapau", "anchova",
  ],
  carne: [
    "carne", "frango", "galinha", "peru", "pato", "porco", "leitao",
    "bacon", "chouric", "presunto", "entrecosto", "vaca", "vitela",
    "bife", "novilho", "picanha", "borrego", "cabrito", "cordeiro",
    "salsicha", "hambur", "almondeg", "costel", "figado",
  ],
  vegetariano: [
    "vegetarian", "vegan", "legumes", "tofu", "grao-de-bico", "grao de bico",
    "lentilha", "feijao", "cogumelo", "beringela", "curgete", "couve-flor",
    "abobora", "espinafre",
  ],
  massa_arroz: [
    "massa", "esparguete", "lasanha", "risotto", "risoto", "arroz",
    "noodles", "spaghetti", "penne", "nhoque", "cuscuz",
  ],
};

const THEME_LABELS: Record<string, string> = {
  peixe: "peixe ou marisco",
  carne: "carne",
  vegetariano: "vegetariano",
  massa_arroz: "massa ou arroz",
};

function matchesTheme(recipe: PoolRecipe, theme: string): boolean {
  const keywords = THEME_KEYWORDS[theme];
  if (!keywords) return true;
  const haystack = normalizeText(
    [recipe.title ?? "", ...(recipe.tags ?? [])].join(" "),
  );
  return keywords.some((keyword) => haystack.includes(keyword));
}

const WEEKDAY_INDEX: Record<string, number> = {
  "segunda-feira": 0,
  "terca-feira": 1,
  "quarta-feira": 2,
  "quinta-feira": 3,
  "sexta-feira": 4,
  "sabado": 5,
  "domingo": 6,
};

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Rotação base com as garantias pedidas: pelo menos 1 dia de peixe,
// pelo menos 1 vegetariano, sem repetir o mesmo tema em dias consecutivos
// (a propriedade mantém-se em qualquer rotação, incluindo ciclicamente).
const BASE_ROTATION = ["peixe", "carne", "vegetariano", "massa_arroz", "carne"];

// Tema do dia, determinístico dentro da mesma semana (todas as chamadas dessa
// semana veem a mesma rotação) mas diferente de semana para semana.
function themeForDay(targetSection: string): string | null {
  const dayIndex = WEEKDAY_INDEX[normalizeText(targetSection)];
  if (dayIndex === undefined) return null; // não é um dia da semana
  if (dayIndex >= 5) return null; // fim-de-semana: tema livre
  const shift = isoWeekNumber(new Date()) % BASE_ROTATION.length;
  return BASE_ROTATION[(dayIndex + shift) % BASE_ROTATION.length];
}

// Amostra aleatória com peso 2 para favoritas: cada favorita entra duas
// vezes no sorteio, ou seja, tem o dobro da probabilidade de ser escolhida
// (mas nunca é garantida).
function sampleCandidates(
  pool: PoolRecipe[],
  favoriteIds: Set<string>,
  count: number,
): PoolRecipe[] {
  const weighted: PoolRecipe[] = [];
  for (const recipe of pool) {
    weighted.push(recipe);
    if (favoriteIds.has(recipe.id)) weighted.push(recipe);
  }
  const picked: PoolRecipe[] = [];
  const pickedIds = new Set<string>();
  for (const recipe of shuffle(weighted)) {
    if (picked.length >= count) break;
    if (pickedIds.has(recipe.id)) continue;
    picked.push(recipe);
    pickedIds.add(recipe.id);
  }
  return picked;
}

function friendlyAiError(error: unknown): Error {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "");
  const status =
    (error as any)?.statusCode ?? (error as any)?.status ?? null;
  const url = (error as any)?.url ?? null;
  const responseBody =
    typeof (error as any)?.responseBody === "string"
      ? (error as any).responseBody.slice(0, 300)
      : null;

  // Contexto para os logs do Netlify: nunca mais um "Not Found" mudo.
  console.error("AI request failed:", {
    message: rawMessage,
    status,
    url,
    responseBody,
  });

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

  const detail = [
    rawMessage || "Não foi possível obter sugestões da IA.",
    status ? `(HTTP ${status})` : null,
    responseBody ? `— ${responseBody}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return new Error(detail);
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

    // Preferências de gosto editáveis pelo utilizador. Sem linha => defaults.
    const { data: prefsRow } = await context.supabase
      .from("user_suggestion_prefs")
      .select("prefs_text")
      .eq("user_id", context.userId)
      .maybeSingle();

    const userPrefs =
      (prefsRow?.prefs_text ?? "").trim() || DEFAULT_USER_PREFS;

    // 1) Pool leve sobre o catálogo INTEIRO classificado (id/título/tipo/tags).
    //    Nota: receitas sem meal_type canónico ficam fora do sorteio.
    const { data: poolRows, error: poolError } = await context.supabase
      .from("recipes")
      .select("id,title,meal_type,tags")
      .in("meal_type", [
        "entrada",
        "prato_principal",
        "sobremesa",
        "acompanhamento",
        "bebida",
      ]);

    if (poolError) throw new Error(poolError.message);

    const pool = ((poolRows ?? []) as PoolRecipe[]).filter(
      (recipe) => !excludedIds.has(recipe.id),
    );

    if (pool.length === 0) {
      return {
        interpretation:
          "Ainda não tens receitas disponíveis para este pedido.",
        sections: [],
        recipes: [],
      };
    }

    const byType = (mealType: string) =>
      pool.filter((recipe) => recipe.meal_type === mealType);

    // 2) Tema do dia (só nos dias úteis do plano semanal).
    const theme = data.targetSection
      ? themeForDay(data.targetSection)
      : null;

    // 3) Amostragem aleatória estratificada.
    const candidates: PoolRecipe[] = [];

    const mains = byType("prato_principal");
    let themedMains = theme
      ? mains.filter((recipe) => matchesTheme(recipe, theme))
      : mains;
    // Salvaguarda: se o tema apanhar poucas receitas, completa com pratos livres.
    if (theme && themedMains.length < 10) {
      themedMains = [
        ...themedMains,
        ...mains.filter((recipe) => !themedMains.includes(recipe)),
      ];
    }

    candidates.push(
      ...sampleCandidates(byType("entrada"), favoriteIds, 16),
      ...sampleCandidates(themedMains, favoriteIds, 20),
      ...sampleCandidates(byType("sobremesa"), favoriteIds, 16),
    );

    // Nos pedidos livres (não semanais) junta acompanhamentos e bebidas,
    // porque o pedido pode mencioná-los.
    if (!data.targetSection) {
      candidates.push(
        ...sampleCandidates(byType("acompanhamento"), favoriteIds, 6),
        ...sampleCandidates(byType("bebida"), favoriteIds, 6),
      );
    }

    // 4) Detalhes completos apenas das candidatas sorteadas.
    const candidateIds = [...new Set(candidates.map((r) => r.id))];

    const { data: detailRows, error: detailError } = await context.supabase
      .from("recipes")
      .select(
        "id,title,meal_type,cuisine_style,tags,estimated_cost_per_serving,calories_per_serving,source_url,image_url",
      )
      .in("id", candidateIds);

    if (detailError) throw new Error(detailError.message);

    const recipes = detailRows ?? [];

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) throw new Error("Missing AI_API_KEY");

    const gateway = createAiProvider(apiKey);
    const model = gateway(
      process.env.AI_MODEL || "gemini-3.1-flash-lite",
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

    const themeRule = theme
      ? `- Tema do dia para os PRATOS PRINCIPAIS: ${THEME_LABELS[theme]}. Escolhe pratos principais alinhados com este tema (o catálogo já vem maioritariamente filtrado). Entradas e sobremesas são livres.`
      : "";

    const planningRules = data.targetSection
      ? `MODO DE GERAÇÃO PARCIAL:
- Gera APENAS o dia/secção "${data.targetSection}".
- Devolve EXATAMENTE uma secção com o nome "${data.targetSection}".
- Não devolvas os restantes dias da semana.
- Por defeito, nesse dia devolve 2 entradas + 2 pratos principais + 2 sobremesas.
- Se o pedido original limitar explicitamente os tipos de prato, respeita essa limitação.
- As receitas usadas em dias anteriores já foram removidas do catálogo; não inventes IDs.
${themeRule}`
      : `PLANEAMENTO SEMANAL:
- Se o pedido falar em organizar/planear refeições da semana (por exemplo "semana", "semanal", "segunda a sexta", "dias úteis" ou "meal prep"), devolve EXATAMENTE 5 secções: "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira" e "Sexta-feira", nesta ordem.
- Se o pedido disser explicitamente "toda a semana", "7 dias", "sete dias" ou "segunda a domingo", inclui também "Sábado" e "Domingo".
- Em cada dia devolve, por defeito, 2 entradas + 2 pratos principais + 2 sobremesas.
- Se o pedido só mencionar um tipo, como "prato principal" ou "almoço rápido", devolve apenas 2 pratos principais.
- Nunca repitas a mesma receita entre dias.
- Garante variedade e equilíbrio ao longo da semana: alterna peixe, carne, opções vegetarianas e massa/arroz nos pratos principais.`;

    const userPrefsBlock = `PREFERÊNCIAS DESTE UTILIZADOR (respeita-as dentro das regras obrigatórias acima; em caso de conflito, as regras técnicas ganham sempre):
${userPrefs}`;

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
- Varia as escolhas: evita sugerir sempre os mesmos pratos óbvios quando houver alternativas adequadas.

${planningRules}

${userPrefsBlock}`;

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
        temperature: 0.45,
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
