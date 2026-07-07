import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Sparkles, ExternalLink, Wallet, Flame, Loader2, ShoppingCart, Check, ArrowRightLeft, Printer } from "lucide-react";
import { suggestMeals } from "@/lib/suggest-meals.functions";
import { addToShoppingList, listShoppingList } from "@/lib/shopping-list.functions";

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

function mealTypeLabel(t?: string | null) {
  if (!t) return "Outro";
  return MEAL_TYPE_LABEL[t] ?? t.replace(/_/g, " ");
}

type Pick = { recipe_id: string; reason: string };
type Section = { section: string; picks: Pick[] };

function AppHome() {
  const [prompt, setPrompt] = useState("");
  const qc = useQueryClient();
  const suggest = useServerFn(suggestMeals);
  const addToList = useServerFn(addToShoppingList);
  const mutation = useMutation({
    mutationFn: (p: string) => suggest({ data: { prompt: p } }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro"),
  });
  const listQ = useQuery(queryOptions({ queryKey: ["shopping-list"], queryFn: () => listShoppingList() }));
  const inListIds = new Set((listQ.data?.items ?? []).map((i) => i.recipe_id));

  const addMut = useMutation({
    mutationFn: (recipe_id: string) => addToList({ data: { recipe_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-list"] });
      toast.success("Adicionado à lista de compras");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  // Editable local copy of the sections so the user can move items across days.
  const [sections, setSections] = useState<Section[]>([]);
  useEffect(() => {
    if (mutation.data) setSections(mutation.data.sections as Section[]);
  }, [mutation.data]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const p = prompt.trim();
    if (p.length < 3) return;
    mutation.mutate(p);
  }

  const result = mutation.data;
  const recipesById = useMemo(
    () => new Map((result?.recipes ?? []).map((r) => [r.id, r])),
    [result],
  );

  const sectionNames = sections.map((s) => s.section);

  function movePick(fromSection: string, recipeId: string, toSection: string) {
    if (fromSection === toSection) return;
    setSections((prev) => {
      const fromIdx = prev.findIndex((s) => s.section === fromSection);
      const toIdx = prev.findIndex((s) => s.section === toSection);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const pick = prev[fromIdx].picks.find((p) => p.recipe_id === recipeId);
      if (!pick) return prev;
      const next = prev.map((s) => ({ ...s, picks: [...s.picks] }));
      next[fromIdx].picks = next[fromIdx].picks.filter((p) => p.recipe_id !== recipeId);
      // Avoid duplicating if already present in target
      if (!next[toIdx].picks.find((p) => p.recipe_id === recipeId)) {
        next[toIdx].picks.push(pick);
      }
      return next;
    });
  }

  return (
    <div>
      <div className="mb-8 print:hidden">
        <h1 className="font-display text-4xl font-semibold">O que apetece hoje?</h1>
        <p className="mt-2 text-muted-foreground">Descreve a refeição e a IA sugere-te opções do teu catálogo.</p>
      </div>

      <form onSubmit={submit} className="surface-warm p-4 print:hidden">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="Ex: Jantar de amigos, 6 pessoas, verão, 8€/cabeça, sem indiana. Entrada e prato principal."
          rows={3}
          className="w-full resize-none rounded-lg border-0 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">⌘/Ctrl + Enter para enviar</span>
          <button
            type="submit"
            disabled={mutation.isPending || prompt.trim().length < 3}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Sugerir
          </button>
        </div>
      </form>

      {!mutation.data && !mutation.isPending && (
        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setPrompt(ex); }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {mutation.isPending && (
        <div className="mt-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> A pensar…
        </div>
      )}

      {result && (
        <div className="mt-10 space-y-8" id="suggestions-printable">
          {result.interpretation && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 text-sm">
              <span className="font-medium text-accent">Interpretação:</span>{" "}
              <span className="text-foreground/80">{result.interpretation}</span>
            </div>
          )}

          {sections.length > 0 && (
            <div className="flex justify-end print:hidden">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                <Printer className="h-4 w-4" /> Guardar como PDF
              </button>
            </div>
          )}

          {sections.length === 0 ? (
            <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
              Não foram encontradas receitas adequadas. Adiciona mais receitas ao teu catálogo.
            </div>
          ) : (
            sections.map((sec) => (
              <section key={sec.section}>
                <h2 className="mb-3 font-display text-xl font-semibold capitalize">{sec.section}</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
                  {sec.picks.map((pick) => {
                    const r = recipesById.get(pick.recipe_id);
                    if (!r) return null;
                    return (
                      <article key={pick.recipe_id} className="surface-warm flex flex-col overflow-hidden p-0">
                        {r.image_url && (
                          <img src={r.image_url} alt={r.title} className="h-40 w-full object-cover" loading="lazy" />
                        )}
                        <div className="flex flex-1 flex-col p-5">
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                              {mealTypeLabel(r.meal_type)}
                            </span>
                            {r.cuisine_style && (
                              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground/70 capitalize">
                                {r.cuisine_style}
                              </span>
                            )}
                          </div>
                          <h3 className="font-display text-lg font-semibold leading-tight">{r.title}</h3>

                          <p className="mt-2 flex-1 text-sm text-muted-foreground">{pick.reason}</p>
                          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                            {r.estimated_cost_per_serving != null && (
                              <span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{Number(r.estimated_cost_per_serving).toFixed(2)}€/pessoa</span>
                            )}
                            {r.calories_per_serving != null && (
                              <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" />{r.calories_per_serving} kcal</span>
                            )}
                          </div>

                          {sectionNames.length > 1 && (
                            <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground print:hidden">
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              Mover para:
                              <select
                                value={sec.section}
                                onChange={(e) => movePick(sec.section, r.id, e.target.value)}
                                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                              >
                                {sectionNames.map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                            </label>
                          )}

                          <div className="mt-4 flex items-center gap-3 print:hidden">
                            {inListIds.has(r.id) ? (
                              <Link to="/shopping-list" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
                                <Check className="h-4 w-4" /> Na lista
                              </Link>
                            ) : (
                              <button
                                onClick={() => addMut.mutate(r.id)}
                                disabled={addMut.isPending}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90 disabled:opacity-50"
                              >
                                <ShoppingCart className="h-4 w-4" /> Adicionar
                              </button>
                            )}
                            {r.source_url && (
                              <a
                                href={r.source_url} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                              >
                                Ver receita <ExternalLink className="h-3.5 w-3.5" />
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
