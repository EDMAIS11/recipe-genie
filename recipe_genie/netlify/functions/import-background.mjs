// Netlify Background Function.
//
// O sufixo "-background" no nome do ficheiro é o que diz ao Netlify para a
// tratar como background function: responde 202 de imediato a quem a invoca e
// continua a correr até 15 minutos (em vez dos ~10s de uma função síncrona).
//
// É disparada (fire-and-forget) pela server function `bulkImportSite`. Corre
// com o cliente de serviço do Supabase (ignora RLS), por isso escreve as
// receitas de forma global.
import { runBulkImport } from "../../src/lib/bulk-import.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

export default async (req) => {
  try {
    // Proteção: só aceita pedidos com o segredo partilhado que a server
    // function autenticada envia. Impede que o endpoint público seja abusado.
    const secret = req.headers.get("x-import-secret");
    if (!process.env.IMPORT_TRIGGER_SECRET || secret !== process.env.IMPORT_TRIGGER_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { source_id, limit = 25, user_id = null } = body ?? {};
    if (!source_id) return new Response("source_id em falta", { status: 400 });

    const { data: src, error } = await supabaseAdmin
      .from("import_sources")
      .select("id, host, site_key, path_includes, search")
      .eq("id", source_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Fonte não encontrada");

    const result = await runBulkImport({
      site: src.site_key,
      config: {
        host: src.host,
        pathIncludes: src.path_includes ?? [],
        search: src.search,
      },
      limit,
      userId: user_id,
      supabase: supabaseAdmin,
      maxMillis: 780000, // 13 min — margem confortável dentro dos 15 min
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

    console.error(
      `[import-bg] ${src.site_key}: descobertos=${result.discovered} importados=${result.imported} falhas=${result.failed}`,
    );
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[import-bg] erro:", err?.message ?? err);
    return new Response(String(err?.message ?? err), { status: 500 });
  }
};
