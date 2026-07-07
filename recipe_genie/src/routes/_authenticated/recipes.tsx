import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Wallet, Flame, Users, Loader2, Link as LinkIcon, Sparkles, Download, Heart, Ban, Play, Pause, Clock, ChevronRight, ChevronDown } from "lucide-react";
import { listRecipes, createRecipe, deleteRecipe } from "@/lib/recipes.functions";
import { previewImportRecipe, saveImportedRecipe } from "@/lib/import-recipe.functions";
import { bulkImportSite } from "@/lib/bulk-import.functions";
import { listImportSources, createImportSource, deleteImportSource, setImportSourceActive } from "@/lib/import-sources.functions";
import { listMyRecipePreferences, setRecipePreference, type RecipePrefStatus } from "@/lib/recipe-preferences.functions";


export const Route = createFileRoute("/_authenticated/recipes")({
  component: RecipesPage,
});

const recipesQO = () =>
  queryOptions({
    queryKey: ["recipes"],
    queryFn: () => listRecipes(),
  });

const prefsQO = () =>
  queryOptions({
    queryKey: ["recipe-preferences"],
    queryFn: () => listMyRecipePreferences(),
  });

type Filter = "all" | "favorite" | "excluded" | "unmarked";

type CatNode = {
  id: string;
  label: string;
  mealType?: string;
  any?: string[];
  children?: CatNode[];
};

const CATEGORY_TREE: CatNode[] = [
  { id: "entrada", label: "Entrada", mealType: "entrada" },
  {
    id: "prato_principal",
    label: "Prato principal",
    mealType: "prato_principal",
    children: [
      {
        id: "carne",
        label: "Carne",
        any: ["carne", "bife", "costel", "hambur", "almôndeg", "almondeg"],
        children: [
          { id: "frango", label: "Frango & aves", any: ["frango", "galinha", "peru", "pato", "codorn"] },
          { id: "porco", label: "Porco", any: ["porco", "leitão", "leitao", "bacon", "chouriç", "chourico", "presunto", "entrecosto", "linguiça", "linguica"] },
          { id: "vaca", label: "Vaca & vitela", any: ["vaca", "vitela", "bife", "novilho", "picanha"] },
          { id: "borrego", label: "Borrego & cabrito", any: ["borrego", "cabrito", "cordeiro"] },
        ],
      },
      {
        id: "peixe",
        label: "Peixe & marisco",
        any: ["peixe", "bacalhau", "salmão", "salmao", "atum", "polvo", "choco", "lulas", "camarão", "camarao", "marisco", "sardinha", "dourada", "robalo", "pescada", "mexilh", "amêijoa", "ameijoa", "gambas", "lagosta"],
        children: [
          { id: "bacalhau", label: "Bacalhau", any: ["bacalhau"] },
          { id: "salmao", label: "Salmão", any: ["salmão", "salmao"] },
          { id: "atum", label: "Atum", any: ["atum"] },
          { id: "marisco", label: "Marisco", any: ["camarão", "camarao", "polvo", "choco", "lulas", "marisco", "mexilh", "amêijoa", "ameijoa", "gambas", "lagosta"] },
        ],
      },
      { id: "vegetariano", label: "Vegetariano", any: ["vegetarian", "vegan", "legumes"] },
      { id: "massa_arroz", label: "Massa & arroz", any: ["massa", "esparguete", "lasanha", "risotto", "risoto", "arroz", "noodles", "spaghetti", "penne"] },
      { id: "sopa", label: "Sopas", any: ["sopa", "caldo verde", "creme de "] },
    ],
  },
  {
    id: "sobremesa",
    label: "Sobremesa",
    mealType: "sobremesa",
    children: [
      { id: "bolo", label: "Bolos & tartes", any: ["bolo", "tarte", "pudim", "cheesecake", "brownie", "torta"] },
      { id: "fruta", label: "Fruta", any: ["fruta", "maçã", "maca", "pera", "morango", "banana", "manga", "ananás", "ananas"] },
      { id: "gelado", label: "Gelados", any: ["gelado", "sorvete", "ice cream"] },
      { id: "chocolate", label: "Chocolate", any: ["chocolate", "cacau"] },
    ],
  },
  { id: "acompanhamento", label: "Acompanhamento", mealType: "acompanhamento" },
  { id: "bebida", label: "Bebida", mealType: "bebida" },
];

function recipeText(r: any): string {
  const parts: string[] = [];
  if (r.title) parts.push(r.title);
  if (r.description) parts.push(r.description);
  if (r.cuisine_style) parts.push(r.cuisine_style);
  if (Array.isArray(r.tags)) parts.push(r.tags.join(" "));
  return parts.join(" ").toLowerCase();
}

// Word-boundary match so e.g. "choco" doesn't match "chocolate" and
// "atum" doesn't match "atumultuado". Boundaries here mean start/end
// of the string or any non-letter character (accented chars count as letters).
const LETTER = "a-záàâãäéèêëíìîïóòôõöúùûüçñ";
function wordMatch(text: string, key: string): boolean {
  const k = key.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^${LETTER}])${k}(?![${LETTER}])`, "i");
  return re.test(text);
}

function computeRecipePaths(r: any): Set<string> {
  const text = recipeText(r);
  const meal = r.meal_type ?? null;
  const paths = new Set<string>();
  const walk = (node: CatNode, prefix: string): boolean => {
    const p = prefix ? `${prefix}/${node.id}` : node.id;
    const selfMatch =
      (node.mealType && meal === node.mealType) ||
      (node.any && node.any.some((k) => wordMatch(text, k))) ||
      false;
    let anyChild = false;
    for (const c of node.children ?? []) {
      if (walk(c, p)) anyChild = true;
    }
    if (selfMatch || anyChild) {
      paths.add(p);
      return true;
    }
    return false;
  };
  for (const n of CATEGORY_TREE) walk(n, "");
  return paths;
}


function RecipesPage() {
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("");
  const [categoryPath, setCategoryPath] = useState<string | null>(null);
  const q = useQuery(recipesQO());
  const p = useQuery(prefsQO());

  const prefMap = useMemo(() => {
    const m = new Map<string, RecipePrefStatus>();
    for (const r of p.data ?? []) m.set(r.recipe_id, r.status);
    return m;
  }, [p.data]);

  const pathsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of q.data ?? []) m.set(r.id, computeRecipePaths(r));
    return m;
  }, [q.data]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const paths of pathsMap.values()) {
      for (const p of paths) m.set(p, (m.get(p) ?? 0) + 1);
    }
    return m;
  }, [pathsMap]);

  const authors = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of q.data ?? []) {
      if (r.author && typeof r.author === "string") {
        set.set(r.author, (set.get(r.author) ?? 0) + 1);
      }
    }
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data]);

  const counts = useMemo(() => {
    const total = q.data?.length ?? 0;
    let fav = 0, exc = 0;
    for (const r of q.data ?? []) {
      const s = prefMap.get(r.id);
      if (s === "favorite") fav++;
      else if (s === "excluded") exc++;
    }
    return { total, fav, exc, unmarked: total - fav - exc };
  }, [q.data, prefMap]);

  const filtered = useMemo(() => {
    let rows = q.data ?? [];
    if (authorFilter) rows = rows.filter((r) => r.author === authorFilter);
    if (categoryPath) rows = rows.filter((r) => pathsMap.get(r.id)?.has(categoryPath));
    if (filter === "all") return rows;
    if (filter === "unmarked") return rows.filter((r) => !prefMap.has(r.id));
    return rows.filter((r) => prefMap.get(r.id) === filter);
  }, [q.data, prefMap, filter, authorFilter, categoryPath, pathsMap]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Receitas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.total} no catálogo · {counts.fav} favoritas · {counts.exc} excluídas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport((v) => !v); setShowForm(false); }}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/5"
          >
            <LinkIcon className="h-4 w-4" /> Importar de URL
          </button>
          <button
            onClick={() => { setShowForm((v) => !v); setShowImport(false); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
      </div>

      <BulkImportPanel />

      {showImport && <ImportRecipe onDone={() => setShowImport(false)} />}
      {showForm && <RecipeForm onDone={() => setShowForm(false)} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          ["all", `Todas (${counts.total})`],
          ["favorite", `Favoritas (${counts.fav})`],
          ["unmarked", `Sem marca (${counts.unmarked})`],
          ["excluded", `Excluídas (${counts.exc})`],
        ] as Array<[Filter, string]>).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {authors.length > 0 && (
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="ml-auto rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground"
            title="Filtrar por chefe"
          >
            <option value="">Todos os chefes</option>
            {authors.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            ))}
          </select>
        )}
      </div>

      {q.isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="surface-warm h-fit p-3 text-sm lg:sticky lg:top-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">Categorias</h3>
            {categoryPath && (
              <button
                onClick={() => setCategoryPath(null)}
                className="text-xs text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
          <button
            onClick={() => setCategoryPath(null)}
            className={`mb-1 w-full rounded-md px-2 py-1 text-left text-xs ${
              categoryPath === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Todas ({counts.total})
          </button>
          <CategoryTree
            nodes={CATEGORY_TREE}
            counts={categoryCounts}
            selected={categoryPath}
            onSelect={setCategoryPath}
          />
        </aside>

        <div>
          {q.data && filtered.length === 0 && !showForm && (
            <div className="surface-warm p-12 text-center">
              <p className="text-muted-foreground">
                {filter === "all" && !categoryPath
                  ? "Ainda não tens receitas. Adiciona a primeira para começar a receber sugestões."
                  : "Nenhuma receita neste filtro."}
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <RecipeCard key={r.id} r={r} pref={prefMap.get(r.id) ?? null} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryTree({
  nodes,
  counts,
  selected,
  onSelect,
  prefix = "",
  depth = 0,
}: {
  nodes: CatNode[];
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (p: string | null) => void;
  prefix?: string;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "mt-0.5 space-y-0.5 border-l border-border pl-2"}>
      {nodes.map((n) => (
        <CategoryNode
          key={n.id}
          node={n}
          counts={counts}
          selected={selected}
          onSelect={onSelect}
          prefix={prefix}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function CategoryNode({
  node,
  counts,
  selected,
  onSelect,
  prefix,
  depth,
}: {
  node: CatNode;
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (p: string | null) => void;
  prefix: string;
  depth: number;
}) {
  const path = prefix ? `${prefix}/${node.id}` : node.id;
  const count = counts.get(path) ?? 0;
  const hasChildren = !!node.children && node.children.length > 0;
  const isSelected = selected === path;
  const isAncestorOfSelected = selected != null && selected.startsWith(path + "/");
  const [open, setOpen] = useState(depth === 0);

  if (count === 0 && !isSelected && !isAncestorOfSelected) return null;

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-md px-1 py-1 text-xs ${
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-4 w-4 items-center justify-center opacity-70 hover:opacity-100"
            aria-label={open ? "Colapsar" : "Expandir"}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
        <button
          type="button"
          onClick={() => onSelect(isSelected ? null : path)}
          className="flex flex-1 items-center justify-between gap-2 truncate text-left"
        >
          <span className="truncate">{node.label}</span>
          <span className={`text-[10px] tabular-nums ${isSelected ? "opacity-80" : "text-muted-foreground"}`}>
            {count}
          </span>
        </button>
      </div>
      {hasChildren && open && (
        <CategoryTree
          nodes={node.children!}
          counts={counts}
          selected={selected}
          onSelect={onSelect}
          prefix={path}
          depth={depth + 1}
        />
      )}
    </li>
  );
}


function BulkImportPanel() {
  const qc = useQueryClient();
  const runFn = useServerFn(bulkImportSite);
  const createFn = useServerFn(createImportSource);
  const delFn = useServerFn(deleteImportSource);
  const toggleFn = useServerFn(setImportSourceActive);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ host: "", path_includes: "/receita/", search: "receita" });

  const sourcesQ = useQuery({
    queryKey: ["import-sources"],
    queryFn: () => listImportSources(),
  });

  const createM = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => {
      toast.success("Site adicionado. Vai começar a importar nos próximos 30 min.");
      setForm({ host: "", path_includes: "/receita/", search: "receita" });
      setShowAdd(false);
      qc.invalidateQueries({ queryKey: ["import-sources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const run = async (id: string, label: string) => {
    setBusy(id);
    try {
      const res = await runFn({ data: { source_id: id, limit: 25 } });
      toast.success(`${label}: ${res.imported} importadas, ${res.failed} falhas`);
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["import-sources"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Remover fonte "${label}"?`)) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["import-sources"] });
      toast.success("Fonte removida");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  const toggle = async (id: string, next: boolean) => {
    try {
      await toggleFn({ data: { id, is_active: next } });
      qc.invalidateQueries({ queryKey: ["import-sources"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—");
  const sources = sourcesQ.data ?? [];

  return (
    <div className="surface-warm mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Fontes de importação</h2>
          <p className="text-xs text-muted-foreground">
            <Clock className="mr-1 inline h-3 w-3" />
            Cada fonte importa 25 receitas a cada 30 min até esgotar.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Adicionar site
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}
          className="mt-3 grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <input
            required type="url" value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="https://www.exemplo.pt"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.path_includes}
            onChange={(e) => setForm({ ...form, path_includes: e.target.value })}
            placeholder="/receita/, /receitas/"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            title="Filtros de URL (vírgula). Só URLs que contenham um destes serão importadas."
          />
          <input
            value={form.search}
            onChange={(e) => setForm({ ...form, search: e.target.value })}
            placeholder="palavra-chave"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            title="Palavra usada para pesquisar dentro do site"
          />
          <button
            type="submit" disabled={createM.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {createM.isPending ? "..." : "Guardar"}
          </button>
        </form>
      )}

      {sources.length === 0 && !showAdd && (
        <p className="mt-3 text-xs text-muted-foreground">
          Ainda não tens fontes. Adiciona um site (ex.: https://www.24kitchen.pt) e a importação começa automaticamente.
        </p>
      )}

      {sources.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-background text-sm">
          {sources.map((s: any) => {
            const last = s.last_result ?? null;
            const active: boolean = !!s.is_active;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="truncate">{s.site_key}</span>
                    {s.exhausted && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">esgotado</span>
                    )}
                    {!active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">pausado</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.host} · última: {fmt(s.last_run_at)}
                    {last?.imported != null && ` · +${last.imported} importadas`}
                    {last?.error && ` · erro: ${last.error}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => run(s.id, s.site_key)}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    title="Correr agora (25 receitas)"
                  >
                    {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Correr
                  </button>
                  <button
                    onClick={() => toggle(s.id, !active)}
                    className="rounded-md border border-border p-1 hover:bg-muted"
                    title={active ? "Pausar" : "Ativar"}
                  >
                    {active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => remove(s.id, s.site_key)}
                    className="rounded-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecipeCard({ r, pref }: { r: any; pref: RecipePrefStatus | null }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteRecipe);
  const setPref = useServerFn(setRecipePreference);

  const m = useMutation({
    mutationFn: () => del({ data: { id: r.id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); toast.success("Removida"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const prefM = useMutation({
    mutationFn: (next: RecipePrefStatus | null) =>
      setPref({ data: { recipe_id: r.id, status: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipe-preferences"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const toggle = (next: RecipePrefStatus) => prefM.mutate(pref === next ? null : next);
  const isFav = pref === "favorite";
  const isExc = pref === "excluded";

  return (
    <article className={`surface-warm flex flex-col overflow-hidden p-0 ${isExc ? "opacity-60" : ""}`}>
      {r.image_url && (
        <img src={r.image_url} alt={r.title} className="h-40 w-full object-cover" loading="lazy" />
      )}
      <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold leading-tight">{r.title}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggle("favorite")}
            disabled={prefM.isPending}
            className={`transition ${isFav ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            title={isFav ? "Remover dos favoritos" : "Marcar como favorita"}
          >
            <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
          </button>
          <button
            onClick={() => toggle("excluded")}
            disabled={prefM.isPending}
            className={`transition ${isExc ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
            title={isExc ? "Deixar de excluir" : "Excluir das sugestões"}
          >
            <Ban className="h-4 w-4" />
          </button>
          <button
            onClick={() => { if (confirm(`Remover "${r.title}"?`)) m.mutate(); }}
            className="text-muted-foreground transition hover:text-destructive"
            title="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {r.author && <p className="mt-1 text-xs font-medium text-primary">por {r.author}</p>}
      {r.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {r.meal_type && <Badge>{r.meal_type}</Badge>}
        {r.cuisine_style && <Badge>{r.cuisine_style}</Badge>}
        {r.tags?.map((t: string) => <Badge key={t}>{t}</Badge>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{r.servings}p</span>
        {r.estimated_cost_per_serving != null && (
          <span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />{Number(r.estimated_cost_per_serving).toFixed(2)}€</span>
        )}
        {r.calories_per_serving != null && (
          <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" />{r.calories_per_serving} kcal</span>
        )}
      </div>
      {r.source_url && (
        <a href={r.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {r.source_site || "Origem"} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      </div>
    </article>
  );
}


function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground capitalize">{children}</span>;
}

function RecipeForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createRecipe);
  const [f, setF] = useState({
    title: "", source_site: "", source_url: "", meal_type: "prato_principal",
    cuisine_style: "portuguesa", servings: 4, calories_per_serving: "", estimated_cost_per_serving: "",
    tags: "", description: "", image_url: "",
  });

  const m = useMutation({
    mutationFn: () => create({
      data: {
        title: f.title,
        description: f.description || null,
        source_site: f.source_site || null,
        source_url: f.source_url || null,
        servings: Number(f.servings),
        meal_type: f.meal_type || null,
        cuisine_style: f.cuisine_style || null,
        tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        calories_per_serving: f.calories_per_serving ? Number(f.calories_per_serving) : null,
        estimated_cost_per_serving: f.estimated_cost_per_serving ? Number(f.estimated_cost_per_serving) : null,
        image_url: f.image_url || null,
      },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recipes"] }); toast.success("Receita adicionada"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
      className="surface-warm mb-6 grid gap-3 p-6 md:grid-cols-2"
    >
      <Field label="Título *" className="md:col-span-2">
        <input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Descrição" className="md:col-span-2">
        <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Site de origem">
        <select value={f.source_site} onChange={(e) => setF({ ...f, source_site: e.target.value })} className={inputCls}>
          <option value="">—</option>
          <option value="24kitchen.pt">24kitchen.pt</option>
          <option value="teleculinaria.pt">teleculinaria.pt</option>
          <option value="manual">manual</option>
        </select>
      </Field>
      <Field label="URL da receita">
        <input type="url" value={f.source_url} onChange={(e) => setF({ ...f, source_url: e.target.value })} className={inputCls} placeholder="https://..." />
      </Field>
      <Field label="Tipo de refeição">
        <select value={f.meal_type} onChange={(e) => setF({ ...f, meal_type: e.target.value })} className={inputCls}>
          <option value="entrada">Entrada</option>
          <option value="prato_principal">Prato principal</option>
          <option value="sobremesa">Sobremesa</option>
          <option value="acompanhamento">Acompanhamento</option>
          <option value="bebida">Bebida</option>
        </select>
      </Field>
      <Field label="Estilo">
        <input value={f.cuisine_style} onChange={(e) => setF({ ...f, cuisine_style: e.target.value })} className={inputCls} placeholder="portuguesa, italiana..." />
      </Field>
      <Field label="Porções">
        <input type="number" min={1} value={f.servings} onChange={(e) => setF({ ...f, servings: Number(e.target.value) })} className={inputCls} />
      </Field>
      <Field label="Calorias/porção">
        <input type="number" min={0} value={f.calories_per_serving} onChange={(e) => setF({ ...f, calories_per_serving: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Custo €/porção (estimativa)">
        <input type="number" step="0.01" min={0} value={f.estimated_cost_per_serving} onChange={(e) => setF({ ...f, estimated_cost_per_serving: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Tags (vírgula)">
        <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} className={inputCls} placeholder="verao, informal, vegetariano" />
      </Field>
      <Field label="URL da imagem" className="md:col-span-2">
        <input type="url" value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} className={inputCls} placeholder="https://..." />
      </Field>


      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
        <button type="submit" disabled={m.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {m.isPending ? "..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ImportRecipe({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const preview = useServerFn(previewImportRecipe);
  const save = useServerFn(saveImportedRecipe);
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<any>(null);

  const previewM = useMutation({
    mutationFn: () => preview({ data: { url } }),
    onSuccess: (d) => setDraft(d),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const saveM = useMutation({
    mutationFn: () => save({ data: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Receita importada");
      setDraft(null); setUrl(""); onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <div className="surface-warm mb-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.24kitchen.pt/receitas/..."
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => previewM.mutate()}
          disabled={previewM.isPending || !url}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {previewM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Extrair
        </button>
        <button onClick={onDone} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A IA vai ler a página, extrair título, ingredientes, imagem e metadados. Depois podes ajustar antes de guardar.
      </p>

      {draft && (
        <div className="mt-6 space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap gap-4">
            {draft.image_url && (
              <img src={draft.image_url} alt="" className="h-32 w-32 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-lg font-semibold outline-none"
              />
              <input
                value={draft.author ?? ""}
                onChange={(e) => setDraft({ ...draft, author: e.target.value || null })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                placeholder="Autor / Chefe"
              />
              <textarea
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none"
                placeholder="Descrição"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input type="number" min={1} value={draft.servings ?? 4}
                  onChange={(e) => setDraft({ ...draft, servings: Number(e.target.value) })}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm" placeholder="Porções" />
                <select value={draft.meal_type ?? "prato_principal"}
                  onChange={(e) => setDraft({ ...draft, meal_type: e.target.value })}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm">
                  <option value="entrada">Entrada</option>
                  <option value="prato_principal">Prato principal</option>
                  <option value="sobremesa">Sobremesa</option>
                  <option value="acompanhamento">Acompanhamento</option>
                  <option value="bebida">Bebida</option>
                </select>
                <input value={draft.cuisine_style ?? ""}
                  onChange={(e) => setDraft({ ...draft, cuisine_style: e.target.value })}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm" placeholder="Estilo" />
                <input type="number" min={0} value={draft.calories_per_serving ?? ""}
                  onChange={(e) => setDraft({ ...draft, calories_per_serving: e.target.value ? Number(e.target.value) : null })}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm" placeholder="kcal/porção" />
              </div>
            </div>
          </div>

          {draft.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {draft.tags.map((t: string) => (
                <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{t}</span>
              ))}
            </div>
          )}

          {draft.ingredients?.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">Ingredientes ({draft.ingredients.length})</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {draft.ingredients.map((i: any, idx: number) => (
                  <li key={idx}>
                    {i.quantity ? `${i.quantity} ` : ""}{i.unit ? `${i.unit} ` : ""}{i.name}
                    {i.notes ? <span className="opacity-60"> — {i.notes}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Descartar</button>
            <button
              onClick={() => saveM.mutate()}
              disabled={saveM.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saveM.isPending ? "A guardar..." : "Guardar receita"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

