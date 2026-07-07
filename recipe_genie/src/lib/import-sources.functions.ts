import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { siteKeyFromHost } from "./bulk-import.server";

export const listImportSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("import_sources")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CreateSchema = z.object({
  host: z.string().trim().url().max(300),
  path_includes: z.string().trim().max(300).optional().default(""),
  search: z.string().trim().max(100).optional().default(""),
});

export const createImportSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const host = data.host.replace(/\/+$/, "");
    const site_key = siteKeyFromHost(host);
    const path_includes = data.path_includes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data: row, error } = await context.supabase
      .from("import_sources")
      .insert({
        host,
        site_key,
        path_includes,
        search: data.search || null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteImportSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("import_sources")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setImportSourceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("import_sources")
      .update({ is_active: data.is_active, exhausted: data.is_active ? false : undefined })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
