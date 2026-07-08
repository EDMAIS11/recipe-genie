import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BulkSchema = z.object({
  source_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(25),
});

// Já não faz a importação aqui (não caberia nos ~10s da função síncrona).
// Em vez disso, dispara a Background Function (que corre até 15 min) e devolve
// logo o controlo. O trabalho pesado acontece em segundo plano.
export const bulkImportSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BulkSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ started: boolean }> => {
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    const secret = process.env.IMPORT_TRIGGER_SECRET;
    if (!secret) throw new Error("IMPORT_TRIGGER_SECRET em falta no ambiente");
    if (!base) throw new Error("URL do site em falta no ambiente");

    // A background function responde 202 de imediato; não esperamos que termine.
    const res = await fetch(`${base}/.netlify/functions/import-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-import-secret": secret,
      },
      body: JSON.stringify({
        source_id: data.source_id,
        limit: data.limit,
        user_id: context.userId,
      }),
    });

    if (res.status !== 202 && !res.ok) {
      throw new Error(`Não foi possível iniciar a importação (HTTP ${res.status})`);
    }

    return { started: true };
  });
