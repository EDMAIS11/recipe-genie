import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BulkImportResult } from "./bulk-import.server";

const BulkSchema = z.object({
  source_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(25),
});

export const bulkImportSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BulkSchema.parse(input))
  .handler(async ({ data, context }): Promise<BulkImportResult> => {
    const { data: src, error } = await context.supabase
      .from("import_sources")
      .select("id, host, site_key, path_includes, search")
      .eq("id", data.source_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Fonte não encontrada");

    const { runBulkImport } = await import("./bulk-import.server");
    const result = await runBulkImport({
      site: src.site_key,
      config: {
        host: src.host,
        pathIncludes: src.path_includes ?? [],
        search: src.search,
      },
      limit: data.limit,
      userId: context.userId,
      supabase: context.supabase,
    });

    const exhausted =
      result.discovered > 0 &&
      result.imported === 0 &&
      result.failed === 0 &&
      result.skipped_duplicates >= result.discovered;

    await context.supabase
      .from("import_sources")
      .update({
        last_run_at: new Date().toISOString(),
        last_result: result,
        exhausted,
      })
      .eq("id", src.id);

    return result;
  });
