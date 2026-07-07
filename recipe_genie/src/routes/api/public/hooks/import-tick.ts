import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron tick every 30 minutes.
 * For each active + not-exhausted import source, imports up to 25 recipes.
 * Marks the source as exhausted when everything the sitemap returns is already
 * in the database.
 */
export const Route = createFileRoute("/api/public/hooks/import-tick")({
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBulkImport } = await import("@/lib/bulk-import.server");

        const { data: sources, error } = await supabaseAdmin
          .from("import_sources")
          .select("*")
          .eq("is_active", true)
          .eq("exhausted", false)
          .order("last_run_at", { ascending: true, nullsFirst: true });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: any[] = [];
        // One tick handles at most one source, to keep runtime bounded and
        // enforce the 30-min cadence per source (round-robin naturally
        // rotates because last_run_at gets bumped).
        const src = (sources ?? [])[0];
        if (!src) {
          return new Response(JSON.stringify({ ok: true, ran: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const result = await runBulkImport({
            site: src.site_key,
            config: {
              host: src.host,
              pathIncludes: (src.path_includes as string[] | null) ?? [],
              search: (src.search as string | null) ?? undefined,
            },
            limit: 25,
            userId: src.created_by as string,
            supabase: supabaseAdmin,
          });

          const exhausted =
            result.discovered > 0 &&
            result.imported === 0 &&
            result.failed === 0 &&
            result.skipped_duplicates >= result.discovered;

          await supabaseAdmin
            .from("import_sources")
            .update({
              last_run_at: new Date().toISOString(),
              last_result: result,
              exhausted,
            })
            .eq("id", src.id);

          results.push({ source_id: src.id, ...result, exhausted });
        } catch (e: any) {
          await supabaseAdmin
            .from("import_sources")
            .update({
              last_run_at: new Date().toISOString(),
              last_result: { error: e?.message ?? String(e) },
            })
            .eq("id", src.id);
          results.push({ source_id: src.id, error: e?.message ?? String(e) });
        }

        return new Response(JSON.stringify({ ok: true, ran: results.length, results }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
