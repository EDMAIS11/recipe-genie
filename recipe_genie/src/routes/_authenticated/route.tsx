import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { ChefHat, BookOpen, Sparkles, LogOut, Wallet, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const returnTo = window.location.pathname + window.location.search + window.location.hash;
      throw redirect({ to: "/auth", search: { redirect: returnTo } });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});


function AuthedLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-6">
          <Link to="/app" className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="h-4 w-4" />
            </div>
            <span className="hidden font-display text-base font-semibold sm:inline">Cozinha IA</span>
          </Link>
          <nav className="flex items-center gap-0.5 sm:gap-1">
            <NavLink to="/app" icon={<Sparkles className="h-4 w-4" />} label="Sugestões" />
            <NavLink to="/recipes" icon={<BookOpen className="h-4 w-4" />} label="Receitas" />
            <NavLink to="/prices" icon={<Wallet className="h-4 w-4" />} label="Preços" />
            <NavLink to="/shopping-list" icon={<ShoppingCart className="h-4 w-4" />} label="Compras" />
            <NavLink to="/preferences" icon={<SlidersHorizontal className="h-4 w-4" />} label="Preferências" />
            <button
              onClick={signOut}
              className="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground sm:ml-2 sm:px-3"
              title="Terminar sessão"
              aria-label="Terminar sessão"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground sm:px-3"
      activeProps={{ className: "active" }}
      title={label}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
