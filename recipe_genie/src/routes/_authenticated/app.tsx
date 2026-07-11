import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  ExternalLink,
  Wallet,
  Flame,
  Loader2,
  ShoppingCart,
  Check,
  ArrowRightLeft,
  Printer,
} from "lucide-react";
import { suggestMeals } from "@/lib/suggest-meals.functions";
import {
  addToShoppingList,
  listShoppingList,
} from "@/lib/shopping-list.functions";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

const EXAMPLES = [
  "Organiza as refeições da semana (segunda a sexta), 2 entradas + 2 pratos principais + 2 sobremesas por dia, até 6€/pessoa.",
  "Jantar de amigos, 6 pessoas, informal, verão. Sem comida indiana. 8€/pessoa. Entrada e prato principal.",
  "Almoço rápido para 2, saudável, até 5€ por pessoa.",
  "Jantar romântico, 2 pessoas, italiano, orçamento livre. Entrada, prato e sobremesa.",
];

const MEAL_TYPE_LABEL: Record<string, string> = {
  entrada: "Entrada",
  prato_principal: "Prato principal",
  sobremesa: "Sobremesa",
  bebida: "Bebida",
  acompanhamento: "Acompanhamento",
  snack: "Snack",
};

const WEEKDAYS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
];

const WEEKEND_DAYS = ["Sábado", "Domingo"];

function mealTypeLabel(type?: string | null) {
  if (!type) return "Outro";
  return MEAL_TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getPlanningDays(prompt: string): string[] | null {
  const normalized = normalizeText(prompt);

  const isWeekly =
    /\bsemana\b|\bsemanal\b|segunda\s+a\s+sexta|dias\s+uteis|meal\s*prep/.test(
      normalized,
    );

  if (!isWeekly) return null;

  const includesWeekend =
    /toda\s+a\s+semana|7\s+dias|sete\s+dias|segunda\s+a\s+domingo/.test(
      normalized,
    );

  return includesWeekend
    ? [...WEEKDAYS, ...WEEKEND_DAYS]
    : WEEKDAYS;
}

function friendlySuggestionError(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "");

  if (
    /504|gateway timeout|inactivity timeout|timeout|timed out|deadline|aborted/i.test(
      rawMessage,
    )
  ) {
    return "A geração demorou demasiado. Tenta novamente; os dias são processados separadamente.";
  }

  if (/<html/i.test(rawMessage)) {
    return "O servidor não conseguiu concluir a geração. Tenta novamente.";
  }

  return rawMessage || "Não foi possível gerar sugestões.";
}

type Pick = {
  recipe_id: string;
  reason: string;
};

type Section = {
  section: string;
  picks: Pick[];
};

function AppHome() {
  const [prompt, setPrompt] = useState("");
  const [progress, setProgress] = useState("");
  const qc = useQueryClient();
  const suggest = useServerFn(suggestMeals);
  const addToList = useServerFn(addToShoppingList);

  const mutation = useMutation({
    mutationFn: async (userPrompt: string) => {
      const planningDays = getPlanningDays(userPrompt);

      if (!planningDays) {
        setProgress("A preparar sugestões…");
        return suggest({
          data: {
            prompt: userPrompt,
          },
        });
      }

      const combinedSections: Section[] = [];
      const combinedRecipes = new Map<string, any>();
      const usedRecipeIds = new Set<string>();
      const interpretations = new Set<string>();
      const missingDays: string[] = [];

      for (
        let index = 0;
        index < planningDays.length;
        index += 1
      ) {
        const day = planningDays[index];

        setProgress(
          `A gerar ${day} (${index + 1}/${planningDays.length})…`,
        );

        try {
          const partialResult = await suggest({
            data: {
              prompt: userPrompt,
              targetSection: day,
              excludeRecipeIds: [...usedRecipeIds],
            },
          });

          for (const recipe of partialResult.recipes ?? []) {
            combinedRecipes.set(recipe.id, recipe);
          }

          const returnedSections =
            partialResult.sections as Section[];

          const matchingSection =
            returnedSections.find(
              (section) =>
                normalizeText(section.section) ===
                normalizeText(day),
            ) ?? returnedSections[0];

          if (!matchingSection) {
            missingDays.push(day);
            continue;
          }

          const uniquePicks = matchingSection.picks.filter(
            (pick) => {
              if (usedRecipeIds.has(pick.recipe_id)) return false;
              usedRecipeIds.add(pick.recipe_id);
              return true;
            },
          );

          if (uniquePicks.length === 0) {
            missingDays.push(day);
            continue;
          }

          combinedSections.push({
            section: day,
            picks: uniquePicks,
          });

          const interpretation =
            partialResult.interpretation?.trim();

          if (interpretation) {
            interpretations.add(interpretation);
          }
        } catch (error) {
          console.error(`Erro ao gerar ${day}:`, error);
          missingDays.push(day);
        }
      }

      if (combinedSections.length === 0) {
        throw new Error(
          "Não foi possível gerar nenhum dos dias do plano.",
        );
      }

      const interpretationParts = [...interpretations];

      if (missingDays.length > 0) {
        interpretationParts.push(
          `Não foi possível completar: ${missingDays.join(", ")}.`,
        );
      }

      return {
        interpretation: interpretationParts.join(" "),
        sections: combinedSections,
        recipes: [...combinedRecipes.values()],
      };
    },
    onError: (error) =>
      toast.error(friendlySuggestionError(error)),
    onSettled: () => setProgress(""),
  });

  const listQ = useQuery(
    queryOptions({
      queryKey: ["shopping-list"],
      queryFn: () => listShoppingList(),
    }),
  );

  const inListIds = new Set(
    (listQ.data?.items ?? []).map((item) => item.recipe_id),
  );

  const addMut = useMutation({
    mutationFn: (recipe_id: string) =>
      addToList({ data: { recipe_id } }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["shopping-list"],
      });
      toast.success("Adicionado à lista de compras");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Erro",
      ),
  });

  // Cópia local editável para permitir mover receitas entre dias.
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    if (mutation.data) {
      setSections(mutation.data.sections as Section[]);
    }
  }, [mutation.data]);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();

    const cleanedPrompt = prompt.trim();
    if (cleanedPrompt.length < 3) return;

    setSections([]);
    mutation.reset();
    mutation.mutate(cleanedPrompt);
  }

  const result = mutation.data;

  const recipesById = useMemo(
    () =>
      new Map(
        (result?.recipes ?? []).map((recipe) => [
          recipe.id,
          recipe,
        ]),
      ),
    [result],
  );

  const sectionNames = sections.map(
    (section) => section.section,
  );

  function movePick(
    fromSection: string,
    recipeId: string,
    toSection: string,
  ) {
    if (fromSection === toSection) return;

    setSections((previousSections) => {
      const fromIndex = previousSections.findIndex(
        (section) => section.section === fromSection,
      );
      const toIndex = previousSections.findIndex(
        (section) => section.section === toSection,
      );

      if (fromIndex < 0 || toIndex < 0) {
        return previousSections;
      }

      const pick = previousSections[fromIndex].picks.find(
        (candidate) => candidate.recipe_id === recipeId,
      );

      if (!pick) return previousSections;

      const nextSections = previousSections.map((section) => ({
        ...section,
        picks: [...section.picks],
      }));

      nextSections[fromIndex].picks = nextSections[
        fromIndex
      ].picks.filter(
        (candidate) => candidate.recipe_id !== recipeId,
      );

      if (
        !nextSections[toIndex].picks.find(
          (candidate) => candidate.recipe_id === recipeId,
        )
      ) {
        nextSections[toIndex].picks.push(pick);
      }

      return nextSections;
    });
  }

  return (
    <div>
      <div className="mb-8 print:hidden">
        <h1 className="font-display text-4xl font-semibold">
          O que apetece hoje?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Descreve a refeição e a IA sugere-te opções do teu
          catálogo.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="surface-warm p-4 print:hidden"
      >
        <textarea
          value={prompt}
          onChange={(event) =>
            setPrompt(event.target.value)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              submit();
            }
          }}
          placeholder="Ex: Jantar de amigos, 6 pessoas, verão, 8€/cabeça, sem indiana. Entrada e prato principal."
          rows={3}
          className="w-full resize-none rounded-lg border-0 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            ⌘/Ctrl + Enter para enviar
          </span>

          <button
            type="submit"
            disabled={
              mutation.isPending || prompt.trim().length < 3
            }
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Sugerir
          </button>
        </div>
      </form>

      {!mutation.data && !mutation.isPending && (
        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => setPrompt(example)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {mutation.isPending && (
        <div className="mt-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {progress || "A pensar…"}
        </div>
      )}

      {result && (
        <div
          className="mt-10 space-y-8"
          id="suggestions-printable"
        >
          {result.interpretation && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 text-sm">
              <span className="font-medium text-accent">
                Interpretação:
              </span>{" "}
              <span className="text-foreground/80">
                {result.interpretation}
              </span>
            </div>
          )}

          {sections.length > 0 && (
            <div className="flex justify-end print:hidden">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Printer className="h-4 w-4" />
                Guardar como PDF
              </button>
            </div>
          )}

          {sections.length === 0 ? (
            <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
              Não foram encontradas receitas adequadas. Adiciona
              mais receitas ao teu catálogo.
            </div>
          ) : (
            sections.map((section) => (
              <section key={section.section}>
                <h2 className="mb-3 font-display text-xl font-semibold capitalize">
                  {section.section}
                </h2>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
                  {section.picks.map((pick) => {
                    const recipe = recipesById.get(
                      pick.recipe_id,
                    );

                    if (!recipe) return null;

                    return (
                      <article
                        key={pick.recipe_id}
                        className="surface-warm flex flex-col overflow-hidden p-0"
                      >
                        {recipe.image_url && (
                          <img
                            src={recipe.image_url}
                            alt={recipe.title}
                            className="h-40 w-full object-cover"
                            loading="lazy"
                          />
                        )}

                        <div className="flex flex-1 flex-col p-5">
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                              {mealTypeLabel(
                                recipe.meal_type,
                              )}
                            </span>

                            {recipe.cuisine_style && (
                              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium capitalize text-foreground/70">
                                {recipe.cuisine_style}
                              </span>
                            )}
                          </div>

                          <h3 className="font-display text-lg font-semibold leading-tight">
                            {recipe.title}
                          </h3>

                          <p className="mt-2 flex-1 text-sm text-muted-foreground">
                            {pick.reason}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {recipe.estimated_cost_per_serving !=
                              null && (
                              <span className="inline-flex items-center gap-1">
                                <Wallet className="h-3.5 w-3.5" />
                                {Number(
                                  recipe.estimated_cost_per_serving,
                                ).toFixed(2)}
                                €/pessoa
                              </span>
                            )}

                            {recipe.calories_per_serving !=
                              null && (
                              <span className="inline-flex items-center gap-1">
                                <Flame className="h-3.5 w-3.5" />
                                {recipe.calories_per_serving} kcal
                              </span>
                            )}
                          </div>

                          {sectionNames.length > 1 && (
                            <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground print:hidden">
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              Mover para:
                              <select
                                value={section.section}
                                onChange={(event) =>
                                  movePick(
                                    section.section,
                                    recipe.id,
                                    event.target.value,
                                  )
                                }
                                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                              >
                                {sectionNames.map((name) => (
                                  <option
                                    key={name}
                                    value={name}
                                  >
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          <div className="mt-4 flex items-center gap-3 print:hidden">
                            {inListIds.has(recipe.id) ? (
                              <Link
                                to="/shopping-list"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
                              >
                                <Check className="h-4 w-4" />
                                Na lista
                              </Link>
                            ) : (
                              <button
                                onClick={() =>
                                  addMut.mutate(recipe.id)
                                }
                                disabled={addMut.isPending}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90 disabled:opacity-50"
                              >
                                <ShoppingCart className="h-4 w-4" />
                                Adicionar
                              </button>
                            )}

                            {recipe.source_url && (
                              <a
                                href={recipe.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                              >
                                Ver receita
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
