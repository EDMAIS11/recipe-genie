import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCcw, ExternalLink } from "lucide-react";
import { listPrices, runPriceUpdate } from "@/lib/prices.functions";

export const Route = createFileRoute("/_authenticated/prices")({
  component: PricesPage,
});

const pricesQO = () =>
  queryOptions({
    queryKey: ["ingredient-prices"],
    queryFn: () => listPrices(),
  });

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} d`;
  return d.toLocaleDateString("pt-PT");
}

function priceCell(p: any) {
  if (!p) return <span className="text-muted-foreground">—</span>;
  if (p.product_name === "NOT_FOUND")
    return <span className="text-xs text-muted-foreground">não encontrado ({fmtDate(p.fetched_at)})</span>;
  if (p.price_eur == null) return <span className="text-muted-foreground">—</span>;
  const unitLabel = p.base_unit === "un" ? "un" : p.base_unit === "ml" ? "l" : "kg";
  const perBig = p.base_unit === "un" ? p.price_per_base_unit : p.price_per_base_unit * 1000;
  return (
    <div className="text-xs">
      <div className="font-medium">{Number(p.price_eur).toFixed(2)} €</div>
      <div className="text-muted-foreground">{perBig.toFixed(2)} €/{unitLabel} · {fmtDate(p.fetched_at)}</div>
      {p.product_url && (
        <a href={p.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ExternalLink className="h-3 w-3" /> ver
        </a>
      )}
    </div>
  );
}

function PricesPage() {
  const qc = useQueryClient();
  const q = useQuery(pricesQO());
  const runFn = useServerFn(runPriceUpdate);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "missing">("all");

  const items = (q.data ?? []).filter((i) =>
    filter === "all" ? true : !i.pingodoce?.price_eur && !i.continente?.price_eur,
  );

  const run = async () => {
    setBusy(true);
    setLastResult(null);
    try {
      const r = await runFn({ data: { limit: 20 } });
      setLastResult(r);
      toast.success(`Atualizados ${r.updated} · não encontrados ${r.not_found} · receitas recalculadas ${r.recipes_updated}`);
      qc.invalidateQueries({ queryKey: ["ingredient-prices"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro a atualizar preços");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Preços de ingredientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pingo Doce e Continente. {q.data?.length ?? 0} ingredientes no catálogo.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            <option value="missing">Sem preço</option>
          </select>
          <button
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Atualizar 20 mais antigos
          </button>
        </div>
      </div>

      {lastResult && (
        <div className="surface-warm mb-4 p-3 text-xs">
          Tentativa: {lastResult.attempted} · atualizados: {lastResult.updated} · não encontrados: {lastResult.not_found} · falhas: {lastResult.failed} · receitas recalculadas: {lastResult.recipes_updated}
          {lastResult.errors?.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer">Erros ({lastResult.errors.length})</summary>
              <ul className="mt-1 list-disc pl-4">
                {lastResult.errors.slice(0, 20).map((e: any, i: number) => (
                  <li key={i}>{e.ingredient} ({e.site}) — {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {q.isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {q.data && items.length === 0 && (
        <div className="surface-warm p-8 text-center text-muted-foreground">
          Nada para mostrar.
        </div>
      )}

      {items.length > 0 && (
        <div className="surface-warm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Ingrediente</th>
                <th className="px-4 py-3">Pingo Doce</th>
                <th className="px-4 py-3">Continente</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3">{priceCell(i.pingodoce)}</td>
                  <td className="px-4 py-3">{priceCell(i.continente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
