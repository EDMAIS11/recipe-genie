import { createFileRoute, Link } from "@tanstack/react-router";
import { ChefHat, Sparkles, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-semibold">Cozinha IA</span>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Alimentado por IA
            </span>
            <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] md:text-6xl">
              A tua cozinha,<br />pensada por IA.
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted-foreground">
              Guarda receitas dos teus sites favoritos, mantém os custos atualizados
              e recebe sugestões de menu à medida — só descreves o que queres.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-warm transition hover:bg-primary/90"
              >
                Começar
              </Link>
            </div>
          </div>

          <div className="grid gap-4">
            <FeatureCard
              icon={<ChefHat className="h-5 w-5" />}
              title="Receitas centralizadas"
              text="Guarda receitas de 24kitchen, Teleculinária e outros sites com ingredientes normalizados."
            />
            <FeatureCard
              icon={<Wallet className="h-5 w-5" />}
              title="Custo por refeição"
              text="Preços dos ingredientes atualizados; cada receita mostra quanto custa por pessoa."
            />
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Sugestões inteligentes"
              text='"Jantar de amigos, 6 pessoas, verão, 8€/cabeça" → 2-3 propostas por secção.'
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="surface-warm p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {icon}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
    </div>
  );
}
