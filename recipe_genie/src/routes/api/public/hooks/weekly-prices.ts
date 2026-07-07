import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly cron: refresh oldest 30 ingredient prices and recompute recipe costs.
 * Guarded by the Supabase publishable key sent as `apikey`.
 */
export const Route = createFileRoute("/api/public/hooks/weekly-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { updateAllPrices, recalculateRecipeCosts } = await import("@/lib/price-update.server");

        let limit = 5;
        try {
          const body = (await request.json()) as { limit?: number } | null;
          if (body && typeof body.limit === "number" && body.limit > 0 && body.limit <= 50) {
            limit = Math.floor(body.limit);
          }
        } catch {
          // no body / invalid JSON — keep default
        }

        try {
          const priceResult = await updateAllPrices({ limit });
          const { recipes_updated } = await recalculateRecipeCosts();
          return new Response(
            JSON.stringify({ ok: true, limit, ...priceResult, recipes_updated }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
