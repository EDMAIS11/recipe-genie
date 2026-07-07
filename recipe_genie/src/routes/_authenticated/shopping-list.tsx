import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  Loader2, Trash2, Minus, Plus, ShoppingCart, Printer,
  ChevronDown, ChevronRight, Users, Mail, X, Wifi, Copy, Check,
  Plus as PlusIcon, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  listShoppingList,
  updateShoppingListItem,
  removeShoppingListItem,
  clearShoppingList,
  setIngredientChecked,
  clearCheckedIngredients,
  listMyShoppingLists,
  createShoppingList,
  renameShoppingList,
  deleteShoppingList,
  listMyShares,
  inviteToShoppingList,
  removeShare,
  claimShareByToken,
  type AggregatedIngredient,
  type MyShoppingList,
} from "@/lib/shopping-list.functions";


export const Route = createFileRoute("/_authenticated/shopping-list")({
  component: ShoppingListPage,
  validateSearch: (search: Record<string, unknown>) => ({
    share: typeof search.share === "string" ? search.share : undefined,
    list: typeof search.list === "string" ? search.list : undefined,
  }),
});


const listQO = (listId?: string) =>
  queryOptions({
    queryKey: ["shopping-list", listId ?? "default"],
    queryFn: () => listShoppingList({ data: listId ? { list_id: listId } : undefined }),
  });
const myListsQO = () =>
  queryOptions({ queryKey: ["my-shopping-lists"], queryFn: () => listMyShoppingLists() });
const sharesQO = (listId: string) =>
  queryOptions({
    queryKey: ["my-shares", listId],
    queryFn: () => listMyShares({ data: { list_id: listId } }),
    enabled: !!listId,
  });

function formatQty(q: number, unit: string, isQb?: boolean) {
  if (isQb || unit === "qb") return "q.b.";
  if (unit === "g" && q >= 1000) return `${(q / 1000).toFixed(2)} kg`;
  if (unit === "ml" && q >= 1000) return `${(q / 1000).toFixed(2)} L`;
  return `${q < 10 ? q.toFixed(2) : Math.round(q)} ${unit}`;
}

function ShoppingListPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [selectedListId, setSelectedListId] = useState<string | undefined>(search.list);
  const [shareOpen, setShareOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const myLists = useQuery(myListsQO());
  const q = useQuery(listQO(selectedListId));

  const update = useServerFn(updateShoppingListItem);
  const remove = useServerFn(removeShoppingListItem);
  const clear = useServerFn(clearShoppingList);
  const setChecked = useServerFn(setIngredientChecked);
  const clearChecks = useServerFn(clearCheckedIngredients);
  const claim = useServerFn(claimShareByToken);
  const createList = useServerFn(createShoppingList);
  const renameList = useServerFn(renameShoppingList);
  const deleteList = useServerFn(deleteShoppingList);

  const data = q.data;
  const listId = data?.list_id ?? selectedListId;
  const isOwner = data?.is_owner ?? true;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shopping-list", selectedListId ?? "default"] });

  // Claim share token from link → switch to that list
  useEffect(() => {
    if (!search.share || claiming) return;
    setClaiming(true);
    claim({ data: { token: search.share } })
      .then((res) => {
        toast.success("Entraste na lista partilhada");
        setSelectedListId(res.list_id);
        qc.invalidateQueries({ queryKey: ["my-shopping-lists"] });
        navigate({ to: "/shopping-list", search: { list: res.list_id }, replace: true });
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Convite inválido");
        navigate({ to: "/shopping-list", replace: true });
      })
      .finally(() => setClaiming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.share]);

  // Sync selectedListId with what the server resolved (first load default)
  useEffect(() => {
    if (data?.list_id && !selectedListId) setSelectedListId(data.list_id);
  }, [data?.list_id, selectedListId]);

  // Realtime for the current list
  useEffect(() => {
    if (!listId) return;
    const channel = supabase
      .channel(`shopping-list-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_list_items", filter: `list_id=eq.${listId}` },
        () => invalidate(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_list_checks", filter: `list_id=eq.${listId}` },
        () => invalidate(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const updateMut = useMutation({
    mutationFn: (v: { id: string; servings?: number; checked?: boolean }) => update({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: invalidate,
  });
  const clearMut = useMutation({
    mutationFn: () => clear({ data: { list_id: listId! } }),
    onSuccess: () => { invalidate(); toast.success("Lista limpa"); },
  });
  const checkMut = useMutation({
    mutationFn: (v: { ingredient_id: string; unit: string; checked: boolean }) =>
      setChecked({ data: { ...v, list_id: listId! } }),
    onMutate: async (v) => {
      const key = ["shopping-list", selectedListId ?? "default"] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<any>(key);
      if (prev) {
        const k = `${v.ingredient_id}::${v.unit}`;
        const nextChecked = v.checked
          ? [...(prev.checked ?? []), { ingredient_id: v.ingredient_id, unit: v.unit }]
          : (prev.checked ?? []).filter((c: any) => `${c.ingredient_id}::${c.unit}` !== k);
        qc.setQueryData(key, { ...prev, checked: nextChecked });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["shopping-list", selectedListId ?? "default"], ctx.prev);
      toast.error("Não foi possível guardar");
    },
    onSettled: invalidate,
  });
  const clearChecksMut = useMutation({
    mutationFn: () => clearChecks({ data: { list_id: listId! } }),
    onSuccess: () => { invalidate(); toast.success("Desmarcados"); },
  });

  const createMut = useMutation({
    mutationFn: () => createList({ data: {} }),
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["my-shopping-lists"] });
      setSelectedListId(row.id);
      navigate({ to: "/shopping-list", search: { list: row.id }, replace: true });
      toast.success(`Criada: ${row.name}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const renameMut = useMutation({
    mutationFn: (v: { id: string; name: string }) => renameList({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-shopping-lists"] });
      invalidate();
      toast.success("Nome atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteList({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-shopping-lists"] });
      setSelectedListId(undefined);
      navigate({ to: "/shopping-list", replace: true });
      toast.success("Lista apagada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const isEmpty = !data || data.items.length === 0;

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const checkedSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of data?.checked ?? []) s.add(`${c.ingredient_id}::${c.unit}`);
    return s;
  }, [data]);

  const groups = useMemo(() => {
    const map = new Map<string, AggregatedIngredient[]>();
    if (data) {
      for (const ing of data.ingredients) {
        const sec = ing.section || "Outros";
        if (!map.has(sec)) map.set(sec, []);
        map.get(sec)!.push(ing);
      }
    }
    return map;
  }, [data]);

  const seasoningsKey = "Temperos (q.b.)";

  const allSectionKeys = useMemo(() => {
    const keys = Array.from(groups.keys());
    if (data && data.seasonings.length > 0) keys.push(seasoningsKey);
    return keys;
  }, [groups, data]);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collapseAll = () => setCollapsedSections(new Set(allSectionKeys));
  const expandAll = () => setCollapsedSections(new Set());

  const lists: MyShoppingList[] = myLists.data ?? [];
  const activeList = lists.find((l) => l.id === listId);

  const handleRename = () => {
    if (!activeList) return;
    const next = prompt("Novo nome:", activeList.name);
    if (next && next.trim() && next.trim() !== activeList.name) {
      renameMut.mutate({ id: activeList.id, name: next.trim() });
    }
  };
  const handleDelete = () => {
    if (!activeList) return;
    if (confirm(`Apagar a lista "${activeList.name}"? Esta ação não pode ser desfeita.`)) {
      deleteMut.mutate(activeList.id);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">Lista de compras</h1>
            {isOwner && activeList && (
              <button
                onClick={handleRename}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Renomear lista"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              <select
                value={listId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedListId(v);
                  navigate({ to: "/shopping-list", search: { list: v }, replace: true });
                }}
                className="rounded border border-border bg-card px-2 py-1 text-sm"
              >
                {lists.length === 0 && <option value="">A carregar…</option>}
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {!l.is_owner && ` · de ${l.owner_display_name ?? "convidado"}`}
                    {" · "}{l.item_count} receita(s)
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
              title="Nova lista"
            >
              <PlusIcon className="h-3 w-3" /> Nova
            </button>
            <span className="text-muted-foreground/60">·</span>
            <span className="inline-flex items-center gap-1">
              <Wifi className="h-3 w-3 text-emerald-500" /> em tempo real
            </span>
            {!isOwner && activeList && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                convidado · só podes marcar itens
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          {isOwner && listId && (
            <button
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
            >
              <Users className="h-4 w-4" /> Partilhar
            </button>
          )}
          {!isEmpty && (
            <>
              {checkedSet.size > 0 && (
                <button
                  onClick={() => clearChecksMut.mutate()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
                >
                  Desmarcar ({checkedSet.size})
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              {isOwner && (
                <button
                  onClick={() => { if (confirm("Limpar toda a lista?")) clearMut.mutate(); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" /> Limpar tudo
                </button>
              )}
            </>
          )}
          {isOwner && activeList && lists.filter((l) => l.is_owner).length > 1 && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive hover:bg-destructive/5"
              title="Apagar esta lista"
            >
              <Trash2 className="h-4 w-4" /> Apagar lista
            </button>
          )}
        </div>
      </div>

      {q.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
        </div>
      )}

      {!q.isLoading && isEmpty && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            {isOwner ? "Nenhuma receita nesta lista." : "Esta lista está vazia."}
          </p>
          {isOwner && (
            <p className="mt-1 text-sm text-muted-foreground">
              Vai a <Link to="/app" className="text-primary hover:underline">Sugestões</Link> ou{" "}
              <Link to="/recipes" className="text-primary hover:underline">Receitas</Link> e adiciona receitas à lista.
            </p>
          )}
        </div>
      )}

      {!isEmpty && (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Receitas selecionadas</h2>
            <div className="space-y-2">
              {data!.items.map((it) => (
                <div key={it.id} className="surface-warm flex items-center gap-3 p-3">
                  {it.recipe.image_url && (
                    <img src={it.recipe.image_url} alt="" className="h-14 w-14 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{it.recipe.title}</div>
                    <div className="text-xs text-muted-foreground">
                      base: {it.recipe.servings} doses
                      {it.recipe.estimated_cost_per_serving != null && ` · ${Number(it.recipe.estimated_cost_per_serving).toFixed(2)}€/pessoa`}
                    </div>
                  </div>
                  {isOwner ? (
                    <div className="flex items-center gap-1 print:hidden">
                      <button
                        className="rounded border border-border p-1 hover:bg-secondary"
                        onClick={() => updateMut.mutate({ id: it.id, servings: Math.max(1, it.servings - 1) })}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-10 text-center text-sm font-medium">{it.servings}</span>
                      <button
                        className="rounded border border-border p-1 hover:bg-secondary"
                        onClick={() => updateMut.mutate({ id: it.id, servings: it.servings + 1 })}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        className="ml-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeMut.mutate(it.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">{it.servings} doses</div>
                  )}
                  <div className="hidden print:block text-sm">{it.servings} doses</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Ingredientes agregados</h2>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <button type="button" onClick={expandAll} className="text-primary hover:underline">
                    Expandir tudo
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button type="button" onClick={collapseAll} className="text-primary hover:underline">
                    Colapsar tudo
                  </button>
                </div>
              </div>
              {data!.total_estimated_cost_eur != null && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Total estimado: </span>
                  <span className="font-semibold">{data!.total_estimated_cost_eur.toFixed(2)}€</span>
                </div>
              )}
            </div>
            <div className="space-y-5">
              {Array.from(groups.entries()).map(([cat, list]) => {
                const isCollapsed = collapsedSections.has(cat);
                return (
                  <div key={cat} className="surface-warm p-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(cat)}
                      className="flex w-full items-center justify-between border-b border-border/60 px-4 py-2 text-left"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {cat} <span className="ml-1 font-normal normal-case text-muted-foreground/70">({list.length})</span>
                      </span>
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className={cn("divide-y divide-border/60", isCollapsed && "hidden print:block")}>
                      {list.map((ing) => {
                        const isChecked = checkedSet.has(`${ing.ingredient_id}::${ing.unit}`);
                        return (
                          <label
                            key={`${ing.ingredient_id}-${ing.unit}`}
                            className="group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-secondary/40 has-[:checked]:opacity-50"
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={isChecked}
                              onChange={(e) =>
                                checkMut.mutate({
                                  ingredient_id: ing.ingredient_id,
                                  unit: ing.unit,
                                  checked: e.target.checked,
                                })
                              }
                            />
                            <div className="flex-1 group-has-[:checked]:line-through">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="font-medium">{ing.name}</span>
                                <span className="text-sm text-muted-foreground whitespace-nowrap">
                                  {formatQty(ing.quantity, ing.unit, ing.is_qb)}
                                  {ing.estimated_cost_eur != null && (
                                    <span className="ml-2 font-medium text-foreground">{ing.estimated_cost_eur.toFixed(2)}€</span>
                                  )}
                                </span>
                              </div>
                              {ing.sources.length > 0 && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  de: {Array.from(new Set(ing.sources.map((s) => s.recipe_title))).join(" · ")}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {data!.seasonings.length > 0 && (
                <div className="surface-warm p-0">
                  <button
                    type="button"
                    onClick={() => toggleSection(seasoningsKey)}
                    className="flex w-full items-center justify-between border-b border-border/60 px-4 py-2 text-left"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {seasoningsKey} <span className="ml-1 font-normal normal-case text-muted-foreground/70">({data!.seasonings.length})</span>
                    </span>
                    {collapsedSections.has(seasoningsKey) ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className={cn("px-4 py-3", collapsedSections.has(seasoningsKey) && "hidden print:block")}>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {data!.seasonings.map((s) => (
                        <span key={s.ingredient_id} className="text-foreground/80" title={s.sources.map((x) => x.recipe_title).join(" · ")}>
                          {s.name}
                          <span className="ml-1 text-xs text-muted-foreground">({s.sources.map((x) => x.recipe_title).join(", ")})</span>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Quantidades a gosto — não somadas na lista de compras.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {shareOpen && listId && (
        <ShareDialog listId={listId} listName={activeList?.name ?? ""} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

function ShareDialog({ listId, listName, onClose }: { listId: string; listName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const shares = useQuery(sharesQO(listId));
  const invite = useServerFn(inviteToShoppingList);
  const rm = useServerFn(removeShare);
  const [email, setEmail] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inviteLink = (token: string) => `${window.location.origin}/shopping-list?share=${encodeURIComponent(token)}`;

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(inviteLink(token)).then(() => {
      setCopiedId(token);
      toast.success("Link copiado — cola no WhatsApp ou mensagem");
      setTimeout(() => setCopiedId((id) => (id === token ? null : id)), 2000);
    });
  };

  const inviteMut = useMutation({
    mutationFn: (e: string) => invite({ data: { email: e, list_id: listId } }),
    onSuccess: (r: any) => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["my-shares", listId] });
      qc.invalidateQueries({ queryKey: ["my-shopping-lists"] });
      if (r?.already) toast.info("Esta pessoa já está convidada");
      else if (r?.invited_user_id) toast.success("Convite aceite (utilizador já existente)");
      else toast.success("Convite guardado — copia o link e partilha");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => rm({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-shares", listId] });
      qc.invalidateQueries({ queryKey: ["my-shopping-lists"] });
      toast.success("Removido");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">Partilhar lista</h3>
            {listName && <div className="text-xs text-muted-foreground">{listName}</div>}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          Convida alguém por email. Depois copia o link e partilha por WhatsApp/mensagem.
          A pessoa entra com esse email e vê a lista em tempo real.
        </p>

        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) inviteMut.mutate(email.trim());
          }}
        >
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              required
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            type="submit"
            disabled={inviteMut.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {inviteMut.isPending ? "…" : "Convidar"}
          </button>
        </form>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pessoas com acesso
          </div>
          {shares.isLoading && (
            <div className="py-3 text-sm text-muted-foreground">A carregar…</div>
          )}
          {!shares.isLoading && (shares.data?.length ?? 0) === 0 && (
            <div className="rounded border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Ainda não partilhaste esta lista.
            </div>
          )}
          <div className="space-y-1.5">
            {shares.data?.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{s.invited_email}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.status === "accepted" ? "Ativo" : "Pendente — aceita quando entrar com este email"}
                  </div>
                </div>
                <div className="ml-2 flex items-center gap-1">
                  <button
                    onClick={() => copyLink(s.share_token)}
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Copiar link de convite"
                  >
                    {copiedId === s.share_token ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => removeMut.mutate(s.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
