// Netlify Background Function (sufixo -background => corre até 15 min).
// Versão COM DIAGNÓSTICO: regista o estado das variáveis de ambiente e faz um
// teste directo ao Supabase para localizar a origem do "Invalid API key".
import { runBulkImport } from "../../src/lib/bulk-import.server";
import { supabaseAdmin } from "../../src/integrations/supabase/client.server";

function describeKey(k) {
  if (!k) return "AUSENTE";
  return `len=${k.length} inicio=${JSON.stringify(k.slice(0, 6))} fim=${JSON.stringify(
    k.slice(-6),
  )} temNL=${/\s/.test(k)}`;
}

export default async (req) => {
  try {
    const secret = req.headers.get("x-import-secret");
    if (!process.env.IMPORT_TRIGGER_SECRET || secret !== process.env.IMPORT_TRIGGER_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { source_id, limit = 25, user_id = null } = body ?? {};
    if (!source_id) return new Response("source_id em falta", { status: 400 });

    // ---- DIAGNÓSTICO ----
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.error(`[import-bg][diag] SUPABASE_URL=${JSON.stringify(url)}`);
    console.error(`[import-bg][diag] SERVICE_ROLE_KEY: ${describeKey(key)}`);

    // Teste directo ao REST do Supabase, sem passar pelo supabase-js, para ver
    // o status real que a chave produz.
    try {
      const probe = await fetch(`${url}/rest/v1/import_sources?select=id&limit=1`, {
        headers: {
          apikey: key ?? "",
          Authorization: `Bearer ${key ?? ""}`,
        },
      });
      const txt = await probe.text();
      console.error(
        `[import-bg][diag] probe REST -> status=${probe.status} body=${JSON.stringify(
          txt.slice(0, 200),
        )}`,
      );
    } catch (e) {
      console.error(`[import-bg][diag] probe REST falhou:`, e?.message ?? e);
    }
    // ---- FIM DIAGNÓSTICO ----

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
      maxMillis: 780000,
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
