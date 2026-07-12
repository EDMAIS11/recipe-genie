import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  getUserPrefs,
  saveUserPrefs,
  DEFAULT_USER_PREFS,
} from "@/lib/user-prefs.functions";

export const Route = createFileRoute("/_authenticated/preferences")({
  component: PreferencesPage,
});

const MAX_LEN = 1500;

const prefsQO = () =>
  queryOptions({
    queryKey: ["user-prefs"],
    queryFn: () => getUserPrefs(),
  });

function PreferencesPage() {
  const qc = useQueryClient();
  const q = useQuery(prefsQO());
  const save = useServerFn(saveUserPrefs);

  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && text === null) setText(q.data.prefsText);
  }, [q.data, text]);

  const value = text ?? "";

  const saveMut = useMutation({
    mutationFn: (t: string) => save({ data: { prefsText: t } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["user-prefs"] });
      setText(r.prefsText);
      toast.success("Preferências guardadas");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao guardar"),
  });

  const isDirty = q.data ? value.trim() !== q.data.prefsText.trim() : false;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">
          Preferências de sugestões
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Descreve por palavras tuas como queres que as refeições sejam
          sugeridas. Estas indicações são respeitadas sempre que possível — mas
          as regras técnicas (usar só receitas do catálogo, variedade, formato)
          mandam sempre em caso de conflito.
        </p>
      </div>

      {q.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
        </div>
      )}

      {q.isError && (
        <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive">
          Não foi possível carregar as preferências.
        </div>
      )}

      {!q.isLoading && !q.isError && (
        <div className="surface-warm p-4">
          <label htmlFor="prefs" className="mb-2 block text-sm font-medium">
            As minhas preferências de gosto
          </label>
          <textarea
            id="prefs"
            value={value}
            maxLength={MAX_LEN}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Ex.: Evita picante. Gosto de peixe à quarta. Sobremesas leves durante a semana."
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Se apagares tudo e guardares, voltas às predefinições.</span>
            <span className={value.length >= MAX_LEN ? "text-destructive" : ""}>
              {value.length}/{MAX_LEN}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveMut.mutate(value)}
              disabled={saveMut.isPending || !isDirty}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setText(DEFAULT_USER_PREFS)}
              disabled={value.trim() === DEFAULT_USER_PREFS}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Repor predefinições
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
