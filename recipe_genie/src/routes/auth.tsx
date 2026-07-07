import { createFileRoute, useNavigate, Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const authRoute = getRouteApi("/auth");

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});


function AuthPage() {
  const navigate = useNavigate();
  const search = authRoute.useSearch() as { redirect?: string };
  const redirect = search.redirect || sessionStorage.getItem("auth_redirect") || "/app";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (search.redirect) sessionStorage.setItem("auth_redirect", search.redirect);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        sessionStorage.removeItem("auth_redirect");
        navigate({ to: redirect });
      }
    });
  }, [navigate, redirect, search.redirect]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/app",
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Já podes entrar.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        sessionStorage.removeItem("auth_redirect");
        navigate({ to: redirect });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    if (search.redirect) sessionStorage.setItem("auth_redirect", search.redirect);
    // Native Supabase OAuth. Enable the Google provider in your Supabase
    // dashboard (Authentication > Providers) and add window.location.origin + "/auth"
    // to the allowed redirect URLs.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth",
      },
    });
    if (error) {
      toast.error(error.message || "Erro Google");
      setLoading(false);
      return;
    }
    // On success Supabase redirects the browser to the provider, so nothing
    // else runs here.
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-semibold">Cozinha IA</span>
        </Link>

        <div className="surface-warm p-8">
          <h1 className="font-display text-2xl font-semibold">
            {mode === "signin" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Bem-vindo de volta." : "Junta-te à cozinha."}
          </p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-secondary disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuar com Google
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">ou email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text" placeholder="Nome" value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            )}
            <input
              type="email" required placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="password" required minLength={6} placeholder="Palavra-passe" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit" disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "Não tens conta? Regista-te" : "Já tens conta? Entra"}
          </button>
        </div>
      </div>
    </div>
  );
}
