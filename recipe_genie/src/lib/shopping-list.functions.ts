import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ShoppingListItem = {
  id: string;
  recipe_id: string;
  servings: number;
  checked: boolean;
  recipe: {
    id: string;
    title: string;
    servings: number;
    image_url: string | null;
    estimated_cost_per_serving: number | null;
  };
};

export type AggregatedIngredient = {
  ingredient_id: string;
  name: string;
  category: string | null;
  section: string;
  unit: string;
  quantity: number;
  is_qb: boolean;
  estimated_cost_eur: number | null;
  sources: Array<{ recipe_id: string; recipe_title: string; quantity: number }>;
};

export type SeasoningIngredient = {
  ingredient_id: string;
  name: string;
  category: string | null;
  sources: Array<{ recipe_id: string; recipe_title: string }>;
};

export type ShoppingListView = {
  list_id: string;
  list_name: string;
  owner_user_id: string;
  is_owner: boolean;
  items: ShoppingListItem[];
  ingredients: AggregatedIngredient[];
  seasonings: SeasoningIngredient[];
  total_estimated_cost_eur: number | null;
  checked: Array<{ ingredient_id: string; unit: string }>;
};

// ============================================================
// Helpers
// ============================================================

async function resolveListForCaller(
  supabase: any,
  callerId: string,
  listId: string | undefined,
): Promise<{ id: string; owner_user_id: string; name: string; is_owner: boolean }> {
  if (listId) {
    const { data: list, error } = await supabase
      .from("shopping_lists")
      .select("id, owner_user_id, name")
      .eq("id", listId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!list) throw new Error("Lista não encontrada ou sem acesso");
    return { ...list, is_owner: list.owner_user_id === callerId };
  }
  // Default: most recently updated list owned by caller; create one if none exists
  const { data: mine } = await supabase
    .from("shopping_lists")
    .select("id, owner_user_id, name")
    .eq("owner_user_id", callerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mine) return { ...mine, is_owner: true };
  const { data: created, error: ce } = await supabase
    .from("shopping_lists")
    .insert({ owner_user_id: callerId, name: "Lista principal" })
    .select("id, owner_user_id, name")
    .single();
  if (ce) throw new Error(ce.message);
  return { ...created, is_owner: true };
}

async function requireOwnedList(supabase: any, callerId: string, listId: string) {
  const { data: list, error } = await supabase
    .from("shopping_lists")
    .select("id, owner_user_id")
    .eq("id", listId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!list) throw new Error("Lista não encontrada");
  if (list.owner_user_id !== callerId) throw new Error("Só o dono pode fazer esta ação");
  return list;
}

// ============================================================
// Lists CRUD
// ============================================================

export type MyShoppingList = {
  id: string;
  name: string;
  owner_user_id: string;
  owner_display_name: string | null;
  is_owner: boolean;
  item_count: number;
  updated_at: string;
};

export const listMyShoppingLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyShoppingList[]> => {
    // RLS on shopping_lists returns all lists the user can access (owner or accepted share)
    const { data: lists, error } = await context.supabase
      .from("shopping_lists")
      .select("id, name, owner_user_id, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = lists ?? [];
    if (rows.length === 0) return [];

    const ownerIds = Array.from(new Set(rows.map((l: any) => l.owner_user_id)));
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ownerIds);
    const profileMap = new Map<string, string | null>();
    for (const p of profiles ?? []) profileMap.set(p.id, p.display_name ?? null);

    const listIds = rows.map((l: any) => l.id);
    const { data: counts } = await context.supabase
      .from("shopping_list_items")
      .select("list_id")
      .in("list_id", listIds);
    const countMap = new Map<string, number>();
    for (const c of counts ?? []) countMap.set(c.list_id, (countMap.get(c.list_id) ?? 0) + 1);

    return rows.map((l: any) => ({
      id: l.id,
      name: l.name,
      owner_user_id: l.owner_user_id,
      owner_display_name: profileMap.get(l.owner_user_id) ?? null,
      is_owner: l.owner_user_id === context.userId,
      item_count: countMap.get(l.id) ?? 0,
      updated_at: l.updated_at,
    }));
  });

const CreateListSchema = z.object({ name: z.string().min(1).max(80).optional() });

export const createShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const today = new Date().toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
    const name = (data.name && data.name.trim()) || `Lista de ${today}`;
    const { data: row, error } = await context.supabase
      .from("shopping_lists")
      .insert({ owner_user_id: context.userId, name })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const RenameListSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(80) });

export const renameShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RenameListSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedList(context.supabase, context.userId, data.id);
    const { error } = await context.supabase
      .from("shopping_lists")
      .update({ name: data.name.trim() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteListSchema = z.object({ id: z.string().uuid() });

export const deleteShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteListSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedList(context.supabase, context.userId, data.id);
    const { error } = await context.supabase.from("shopping_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// List contents
// ============================================================

const ListInput = z.object({ list_id: z.string().uuid().optional() }).optional();

export const listShoppingList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input))
  .handler(async ({ data, context }): Promise<ShoppingListView> => {
    const list = await resolveListForCaller(context.supabase, context.userId, data?.list_id);

    const { data: rows, error } = await context.supabase
      .from("shopping_list_items")
      .select(
        "id, recipe_id, servings, checked, recipe:recipes(id, title, servings, image_url, estimated_cost_per_serving)",
      )
      .eq("list_id", list.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const items = (rows ?? []) as unknown as ShoppingListItem[];
    const baseView: ShoppingListView = {
      list_id: list.id,
      list_name: list.name,
      owner_user_id: list.owner_user_id,
      is_owner: list.is_owner,
      items: [],
      ingredients: [],
      seasonings: [],
      total_estimated_cost_eur: 0,
      checked: [],
    };
    if (items.length === 0) return { ...baseView };

    const recipeIds = items.map((i) => i.recipe_id);
    const { data: ings, error: ie } = await context.supabase
      .from("recipe_ingredients")
      .select("recipe_id, ingredient_id, quantity, unit, ingredient:ingredients(id, name, category, base_unit)")
      .in("recipe_id", recipeIds);
    if (ie) throw new Error(ie.message);

    const ingredientIds = Array.from(new Set((ings ?? []).map((x: any) => x.ingredient_id)));
    const priceMap = new Map<string, { price_per_base_unit: number; base_unit: string }>();
    if (ingredientIds.length > 0) {
      const { data: prices } = await context.supabase
        .from("ingredient_prices")
        .select("ingredient_id, price_per_base_unit, base_unit, is_current")
        .in("ingredient_id", ingredientIds)
        .eq("is_current", true)
        .not("price_per_base_unit", "is", null);
      for (const p of prices ?? []) {
        if (!priceMap.has(p.ingredient_id) && p.price_per_base_unit != null && p.base_unit) {
          priceMap.set(p.ingredient_id, {
            price_per_base_unit: Number(p.price_per_base_unit),
            base_unit: p.base_unit,
          });
        }
      }
    }

    const recipesById = new Map(items.map((i) => [i.recipe_id, i]));
    const agg = new Map<string, AggregatedIngredient>();

    function normalise(qty: number, unit: string): { qty: number; unit: string } {
      const u = (unit || "").trim().toLowerCase();
      if (u === "kg") return { qty: qty * 1000, unit: "g" };
      if (u === "g" || u === "gr" || u === "grama" || u === "gramas") return { qty, unit: "g" };
      if (u === "mg") return { qty: qty / 1000, unit: "g" };
      if (u === "l" || u === "lt" || u === "litro" || u === "litros") return { qty: qty * 1000, unit: "ml" };
      if (u === "ml") return { qty, unit: "ml" };
      if (u === "cl") return { qty: qty * 10, unit: "ml" };
      if (u === "dl") return { qty: qty * 100, unit: "ml" };
      if (u === "unidade" || u === "unidades" || u === "un" || u === "uni" || u === "") return { qty, unit: "un" };
      return { qty, unit: u };
    }

    const seasoningsMap = new Map<string, SeasoningIngredient>();
    const SECTION_TEMPEROS = "Temperos e Especiarias";

    function classifySection(name: string): string {
      const n = (name || "").toLowerCase().trim();
      const has = (...arr: string[]) => arr.some((w) => n.includes(w));
      if (has(
        "sal ", "sal,", "sal.", "flor de sal", "pimenta", "piri-piri", "piri piri",
        "louro", "oregano", "orégão", "orégãos", "tomilho", "alecrim", "manjericão",
        "salsa", "coentro", "coentros", "cebolinho", "hortelã", "estragão",
        "canela", "noz-moscada", "noz moscada", "cominho", "cominhos", "curcuma", "cúrcuma",
        "colorau", "paprika", "pápr", "caril", "gengibre em pó",
        "azeite", "vinagre", "mostarda", "molho inglês", "molho de soja", "shoyu",
        "óleo", "oleo",
      )) return SECTION_TEMPEROS;
      if (n === "sal" || n === "pimenta" || n === "açúcar" || n === "acucar") {
        return n === "açúcar" || n === "acucar" ? "Mercearia" : SECTION_TEMPEROS;
      }
      if (has(
        "alface", "tomate", "cebola", "alho", "batata", "cenoura", "courgette", "abobrinha",
        "abóbora", "abobora", "pimento", "pepino", "brócolo", "brocolo", "couve",
        "espinafre", "rúcula", "rucula", "agrião", "agriao", "aipo", "aipos",
        "cogumelo", "cogumelos", "beringela", "beterraba", "rabanete", "nabo",
        "limão", "limao", "laranja", "maçã", "maca", "pera", "banana", "morango",
        "framboesa", "mirtilo", "melão", "melancia", "ananás", "ananas", "manga",
        "abacate", "romã", "roma", "uva", "figo", "kiwi", "ervilha", "fava",
        "feijão verde", "feijao verde", "salsão", "salsao",
      )) return "Frutas e Legumes";
      if (has(
        "bacalhau", "salmão", "salmao", "atum fresco", "pescada", "dourada", "robalo",
        "polvo", "lulas", "choco", "camarão", "camarao", "gamba", "ameijoa", "amêijoa",
        "mexilhão", "mexilhao", "sardinha", "cavala", "linguado", "peixe-espada",
      )) return "Peixaria";
      if (has(
        "presunto", "fiambre", "chouriço", "chourico", "salpicão", "salpicao",
        "morcela", "farinheira", "bacon", "chorizo", "linguiça", "linguica",
        "paio", "mortadela",
      )) return "Charcutaria";
      if (has(
        "carne", "aparas", "vitela", "porco", "vaca", "borrego", "cordeiro",
        "frango", "peru", "coelho", "pato", "entrecosto", "costeleta", "bife",
        "lombo", "picada", "almondega", "almôndega", "salsicha",
      )) return "Talho";
      if (has("pão", "pao ", "baguete", "broa", "chapata", "bolacha", "biscoito", "tosta")) return "Padaria";
      if (has(
        "leite", "iogurte", "queijo", "manteiga", "requeijão", "requeijao",
        "natas", "creme", "nata", "ovo", "ovos", "cottage", "ricota", "mascarpone",
      )) return "Laticínios e Ovos";
      if (has("congelado", "gelado", "polpa de fruta")) return "Congelados";
      if (has("vinho", "cerveja", "sumo", "refrigerante", "água", "agua", "cidra")) return "Bebidas";
      if (has(
        "arroz", "massa", "esparguete", "esparguet", "pene", "penne", "fusilli",
        "farinha", "açúcar", "acucar", "fermento", "levedura", "cacau", "chocolate",
        "mel", "geleia", "compota", "granola", "aveia", "flocos", "cereais",
        "lentilha", "grão", "grao", "feijão", "feijao", "ervilha seca",
        "azeitona", "alcaparra", "conserva", "atum enlatado", "atum ",
        "tomate pelado", "polpa de tomate", "molho de tomate", "coco ",
        "leite de coco", "caldo", "puré", "pure", "puree",
      )) return "Mercearia";
      return "Outros";
    }

    for (const row of (ings ?? []) as any[]) {
      const item = recipesById.get(row.recipe_id);
      if (!item) continue;
      const scale = item.servings / Math.max(1, item.recipe.servings);
      const rawUnit = row.unit || row.ingredient?.base_unit || "g";
      const rawQty = Number(row.quantity) * scale;
      const name = row.ingredient?.name ?? "?";
      const section = classifySection(name);

      if (section === SECTION_TEMPEROS) {
        const key = row.ingredient_id;
        let s = seasoningsMap.get(key);
        if (!s) {
          s = {
            ingredient_id: row.ingredient_id,
            name,
            category: row.ingredient?.category ?? null,
            sources: [],
          };
          seasoningsMap.set(key, s);
        }
        if (!s.sources.some((x) => x.recipe_id === row.recipe_id)) {
          s.sources.push({ recipe_id: row.recipe_id, recipe_title: item.recipe.title });
        }
        continue;
      }

      const u = (rawUnit || "").trim().toLowerCase().replace(/\./g, "");
      const isQb = u === "qb" || u === "qbt" || rawQty <= 0 || !Number.isFinite(rawQty);
      const { qty, unit } = isQb ? { qty: 0, unit: "qb" } : normalise(rawQty, rawUnit);
      const key = `${row.ingredient_id}::${unit}`;
      let entry = agg.get(key);
      if (!entry) {
        entry = {
          ingredient_id: row.ingredient_id,
          name,
          category: row.ingredient?.category ?? null,
          section,
          unit,
          quantity: 0,
          is_qb: isQb,
          estimated_cost_eur: null,
          sources: [],
        };
        agg.set(key, entry);
      }
      entry.quantity += qty;
      entry.sources.push({ recipe_id: row.recipe_id, recipe_title: item.recipe.title, quantity: qty });
    }

    for (const entry of agg.values()) {
      const price = priceMap.get(entry.ingredient_id);
      if (!price) continue;
      const factor = normalise(1, price.base_unit);
      if (factor.unit !== entry.unit) continue;
      const pricePerNormUnit = price.price_per_base_unit / factor.qty;
      entry.estimated_cost_eur = Math.round(pricePerNormUnit * entry.quantity * 100) / 100;
    }

    const SECTION_ORDER = [
      "Frutas e Legumes",
      "Talho",
      "Peixaria",
      "Charcutaria",
      "Padaria",
      "Laticínios e Ovos",
      "Mercearia",
      "Congelados",
      "Bebidas",
      "Outros",
    ];
    const ingredients = Array.from(agg.values()).sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a.section);
      const ib = SECTION_ORDER.indexOf(b.section);
      const ra = ia === -1 ? 999 : ia;
      const rb = ib === -1 ? 999 : ib;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

    const total = ingredients.reduce((s, x) => (x.estimated_cost_eur != null ? s + x.estimated_cost_eur : s), 0);
    const seasonings = Array.from(seasoningsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    const { data: checkRows } = await context.supabase
      .from("shopping_list_checks")
      .select("ingredient_id, unit, checked")
      .eq("list_id", list.id)
      .eq("checked", true);
    const checked = (checkRows ?? []).map((r: any) => ({ ingredient_id: r.ingredient_id, unit: r.unit ?? "" }));

    return {
      ...baseView,
      items,
      ingredients,
      seasonings,
      total_estimated_cost_eur: Math.round(total * 100) / 100,
      checked,
    };
  });

const AddSchema = z.object({
  recipe_id: z.string().uuid(),
  servings: z.number().positive().optional(),
  list_id: z.string().uuid().optional(),
});

export const addToShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddSchema.parse(input))
  .handler(async ({ data, context }) => {
    const list = await resolveListForCaller(context.supabase, context.userId, data.list_id);
    if (!list.is_owner) throw new Error("Só o dono pode adicionar receitas");
    let servings = data.servings;
    if (servings == null) {
      const { data: r } = await context.supabase
        .from("recipes")
        .select("servings")
        .eq("id", data.recipe_id)
        .maybeSingle();
      servings = r?.servings ?? 1;
    }
    const { error } = await context.supabase
      .from("shopping_list_items")
      .upsert(
        { list_id: list.id, user_id: context.userId, recipe_id: data.recipe_id, servings },
        { onConflict: "list_id,recipe_id" },
      );
    if (error) throw new Error(error.message);
    // bump updated_at so this list bubbles up in the picker
    await context.supabase.from("shopping_lists").update({ updated_at: new Date().toISOString() }).eq("id", list.id);
    return { ok: true, list_id: list.id };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  servings: z.number().positive().optional(),
  checked: z.boolean().optional(),
});

export const updateShoppingListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: { servings?: number; checked?: boolean } = {};
    if (data.servings != null) patch.servings = data.servings;
    if (data.checked != null) patch.checked = data.checked;
    const { error } = await context.supabase
      .from("shopping_list_items")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RemoveSchema = z.object({ id: z.string().uuid() });

export const removeShoppingListItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shopping_list_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ClearSchema = z.object({ list_id: z.string().uuid() });

export const clearShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClearSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedList(context.supabase, context.userId, data.list_id);
    const { error } = await context.supabase.from("shopping_list_items").delete().eq("list_id", data.list_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("shopping_list_checks").delete().eq("list_id", data.list_id);
    return { ok: true };
  });

const SetCheckSchema = z.object({
  list_id: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  unit: z.string().default(""),
  checked: z.boolean(),
});

export const setIngredientChecked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SetCheckSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.checked) {
      const { error } = await context.supabase
        .from("shopping_list_checks")
        .upsert(
          {
            list_id: data.list_id,
            user_id: context.userId,
            ingredient_id: data.ingredient_id,
            unit: data.unit,
            checked: true,
          },
          { onConflict: "list_id,ingredient_id,unit" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("shopping_list_checks")
        .delete()
        .eq("list_id", data.list_id)
        .eq("ingredient_id", data.ingredient_id)
        .eq("unit", data.unit);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const ClearChecksSchema = z.object({ list_id: z.string().uuid() });

export const clearCheckedIngredients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClearChecksSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shopping_list_checks").delete().eq("list_id", data.list_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Sharing
// ============================================================

export type ShareRow = {
  id: string;
  invited_email: string;
  invited_user_id: string | null;
  status: string;
  permission: string;
  created_at: string;
  share_token: string;
};

const ListSharesSchema = z.object({ list_id: z.string().uuid() });

export const listMyShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListSharesSchema.parse(input))
  .handler(async ({ data, context }): Promise<ShareRow[]> => {
    await requireOwnedList(context.supabase, context.userId, data.list_id);
    const { data: rows, error } = await context.supabase
      .from("shopping_list_shares")
      .select("id, invited_email, invited_user_id, status, permission, created_at, share_token")
      .eq("list_id", data.list_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ShareRow[];
  });

const InviteSchema = z.object({
  list_id: z.string().uuid(),
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
});

export const inviteToShoppingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwnedList(context.supabase, context.userId, data.list_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let invitedUserId: string | null = null;
    try {
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = userList?.users?.find((u: any) => (u.email ?? "").toLowerCase() === data.email);
      if (match) invitedUserId = match.id;
    } catch {
      // ignore
    }

    if (invitedUserId === context.userId) {
      throw new Error("Não podes convidar-te a ti próprio");
    }

    const { data: existing } = await context.supabase
      .from("shopping_list_shares")
      .select("id, status, share_token")
      .eq("list_id", data.list_id)
      .eq("invited_email", data.email)
      .maybeSingle();

    if (existing) {
      if (invitedUserId) {
        await context.supabase
          .from("shopping_list_shares")
          .update({ invited_user_id: invitedUserId, status: "accepted" })
          .eq("id", existing.id);
      }
      return { ok: true, already: true, invited_user_id: invitedUserId, share_token: existing.share_token };
    }

    const { data: inserted, error } = await context.supabase
      .from("shopping_list_shares")
      .insert({
        list_id: data.list_id,
        owner_user_id: context.userId,
        invited_email: data.email,
        invited_user_id: invitedUserId,
        status: invitedUserId ? "accepted" : "pending",
        permission: "check_only",
      })
      .select("share_token")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, already: false, invited_user_id: invitedUserId, share_token: inserted?.share_token };
  });

const RemoveShareSchema = z.object({ id: z.string().uuid() });

export const removeShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveShareSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("shopping_list_shares")
      .delete()
      .eq("id", data.id)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ClaimTokenSchema = z.object({ token: z.string().uuid() });

export const claimShareByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClaimTokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: share, error: fetchErr } = await context.supabase
      .from("shopping_list_shares")
      .select("id, list_id, owner_user_id, invited_user_id, invited_email, status")
      .eq("share_token", data.token)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!share) throw new Error("Convite inválido");
    if (share.owner_user_id === context.userId) throw new Error("Não podes usar o teu próprio convite");
    if (share.invited_user_id && share.invited_user_id !== context.userId) {
      throw new Error("Este convite já foi utilizado por outra conta");
    }
    if (share.status === "accepted" && share.invited_user_id === context.userId) {
      return { list_id: share.list_id };
    }

    const { data: userData } = await context.supabase.auth.getUser();
    const userEmail = userData?.user?.email ?? null;
    if (share.invited_email && userEmail && share.invited_email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error("Este convite é para outro email");
    }

    const { error } = await context.supabase
      .from("shopping_list_shares")
      .update({ invited_user_id: context.userId, status: "accepted" })
      .eq("id", share.id);
    if (error) throw new Error(error.message);
    return { list_id: share.list_id };
  });
