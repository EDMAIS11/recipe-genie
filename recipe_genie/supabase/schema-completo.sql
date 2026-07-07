-- ============================================================
-- ESQUEMA COMPLETO — Recipe Genie
-- Gerado juntando todas as migracoes por ordem cronologica.
-- Cola este ficheiro inteiro no SQL Editor do Supabase e corre.
-- ============================================================

-- Extensoes necessarias para o job agendado (cron). Ativadas primeiro
-- para a migracao do cron nao falhar num projeto novo.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 20260705233713_61c78726-8506-4865-a278-caa27017421a.sql
-- ------------------------------------------------------------
-- PROFILES
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INGREDIENTS (catálogo partilhado)
CREATE TABLE public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  base_unit TEXT NOT NULL DEFAULT 'g', -- g, ml, un
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT ALL ON public.ingredients TO service_role;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ingredients viewable by authenticated" ON public.ingredients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add ingredients" ON public.ingredients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update ingredients" ON public.ingredients
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- RECIPES
CREATE TABLE public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_site TEXT, -- '24kitchen.pt', 'teleculinaria.pt', 'manual', etc.
  source_url TEXT,
  servings INT NOT NULL DEFAULT 4,
  prep_time_min INT,
  cook_time_min INT,
  meal_type TEXT, -- 'entrada','prato_principal','sobremesa','acompanhamento','bebida'
  cuisine_style TEXT, -- 'portuguesa','italiana','indiana','asiatica','mediterranica', etc.
  tags TEXT[] DEFAULT '{}', -- 'verao','informal','vegetariano','sem_gluten'...
  calories_per_serving INT,
  estimated_cost_per_serving NUMERIC(10,2),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipes viewable by authenticated" ON public.recipes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create recipes" ON public.recipes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own recipes" ON public.recipes
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own recipes" ON public.recipes
  FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_recipes_updated_at BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_recipes_meal_type ON public.recipes(meal_type);
CREATE INDEX idx_recipes_cuisine ON public.recipes(cuisine_style);
CREATE INDEX idx_recipes_tags ON public.recipes USING GIN(tags);

-- RECIPE_INGREDIENTS
CREATE TABLE public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(10,3) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'g',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_ingredients TO authenticated;
GRANT ALL ON public.recipe_ingredients TO service_role;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipe ingredients viewable by authenticated" ON public.recipe_ingredients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage ingredients of own recipes" ON public.recipe_ingredients
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.created_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND r.created_by = auth.uid())
  );
CREATE INDEX idx_recipe_ingredients_recipe ON public.recipe_ingredients(recipe_id);

-- ------------------------------------------------------------
-- 20260705233748_ec254635-a0a5-4ae8-810c-b3295f64c36e.sql
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 20260706002942_01c22d18-df28-4193-b175-ba0368ba2f6c.sql
-- ------------------------------------------------------------
CREATE TABLE public.ingredient_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  source_site text NOT NULL CHECK (source_site IN ('pingodoce.pt','continente.pt')),
  product_name text,
  product_url text,
  price_eur numeric(10,2),
  package_quantity numeric,
  package_unit text,
  price_per_base_unit numeric(12,4),
  base_unit text,
  is_current boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingredient_prices TO authenticated;
GRANT ALL ON public.ingredient_prices TO service_role;

ALTER TABLE public.ingredient_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Prices viewable by authenticated"
  ON public.ingredient_prices FOR SELECT
  TO authenticated USING (true);

CREATE UNIQUE INDEX ingredient_prices_current_uidx
  ON public.ingredient_prices (ingredient_id, source_site)
  WHERE is_current;

CREATE INDEX ingredient_prices_ingredient_idx
  ON public.ingredient_prices (ingredient_id);

CREATE INDEX ingredient_prices_fetched_idx
  ON public.ingredient_prices (fetched_at DESC);

-- ------------------------------------------------------------
-- 20260706003039_cd39f505-6c6f-4f2f-a8ba-4ee7756fc634.sql
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingredients_needing_price_refresh(
  p_limit int DEFAULT 20,
  p_stale_days int DEFAULT 7
)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.name
  FROM public.ingredients i
  LEFT JOIN LATERAL (
    SELECT max(fetched_at) AS latest
    FROM public.ingredient_prices p
    WHERE p.ingredient_id = i.id
  ) lp ON true
  WHERE lp.latest IS NULL
     OR lp.latest < now() - make_interval(days => p_stale_days)
  ORDER BY lp.latest NULLS FIRST, i.name
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.ingredients_needing_price_refresh(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.ingredients_needing_price_refresh(int, int) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 20260706003049_b4e7430c-8331-44e8-94d5-326325eb496b.sql
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingredients_needing_price_refresh(
  p_limit int DEFAULT 20,
  p_stale_days int DEFAULT 7
)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT i.id, i.name
  FROM public.ingredients i
  LEFT JOIN LATERAL (
    SELECT max(fetched_at) AS latest
    FROM public.ingredient_prices p
    WHERE p.ingredient_id = i.id
  ) lp ON true
  WHERE lp.latest IS NULL
     OR lp.latest < now() - make_interval(days => p_stale_days)
  ORDER BY lp.latest NULLS FIRST, i.name
  LIMIT p_limit;
$$;

-- ------------------------------------------------------------
-- 20260706005238_4ff54060-b94e-4993-be47-8bfa0a48a56c.sql
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingredients_needing_price_refresh(p_limit integer DEFAULT 20, p_stale_days integer DEFAULT 7)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Prioritisation:
  --  1) ingredients that never had any price row (priority 0)
  --  2) ingredients whose only current data is NOT_FOUND older than 1 day (priority 1)
  --  3) ingredients whose newest price is older than p_stale_days (priority 2)
  -- Never returns anything fetched in the last 1 day to avoid loops.
  WITH latest AS (
    SELECT p.ingredient_id,
           max(p.fetched_at) AS latest_fetched,
           bool_or(p.is_current AND p.price_eur IS NOT NULL) AS has_real_price
    FROM public.ingredient_prices p
    GROUP BY p.ingredient_id
  ),
  ranked AS (
    SELECT i.id, i.name,
      CASE
        WHEN l.ingredient_id IS NULL THEN 0
        WHEN l.has_real_price = false AND l.latest_fetched < now() - interval '1 day' THEN 1
        WHEN l.has_real_price = true AND l.latest_fetched < now() - make_interval(days => p_stale_days) THEN 2
        ELSE NULL
      END AS priority,
      l.latest_fetched
    FROM public.ingredients i
    LEFT JOIN latest l ON l.ingredient_id = i.id
  )
  SELECT id, name
  FROM ranked
  WHERE priority IS NOT NULL
  ORDER BY priority ASC, latest_fetched ASC NULLS FIRST, name
  LIMIT p_limit;
$function$;

-- ------------------------------------------------------------
-- 20260706005711_2316b8d3-8524-458b-b1ed-20c8036b0cdf.sql
-- ------------------------------------------------------------
CREATE TYPE public.recipe_pref_status AS ENUM ('favorite', 'excluded');

CREATE TABLE public.recipe_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  status public.recipe_pref_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipe_id)
);

CREATE INDEX recipe_preferences_user_status_idx
  ON public.recipe_preferences (user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_preferences TO authenticated;
GRANT ALL ON public.recipe_preferences TO service_role;

ALTER TABLE public.recipe_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own recipe preferences"
  ON public.recipe_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER recipe_preferences_set_updated_at
  BEFORE UPDATE ON public.recipe_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 20260706010720_146b3564-ce27-4ba3-8eb2-3c8b43fc62a3.sql
-- ------------------------------------------------------------
CREATE TABLE public.shopping_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  servings NUMERIC NOT NULL DEFAULT 1 CHECK (servings > 0),
  checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipe_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT ALL ON public.shopping_list_items TO service_role;

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shopping list items"
  ON public.shopping_list_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER shopping_list_items_set_updated_at
  BEFORE UPDATE ON public.shopping_list_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX shopping_list_items_user_idx ON public.shopping_list_items(user_id);

-- ------------------------------------------------------------
-- 20260706013258_07882bb1-f087-4b26-adc4-acffdd9b6b43.sql
-- ------------------------------------------------------------
CREATE TABLE public.shopping_list_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients ON DELETE CASCADE,
  unit TEXT NOT NULL DEFAULT '',
  checked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ingredient_id, unit)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_checks TO authenticated;
GRANT ALL ON public.shopping_list_checks TO service_role;

ALTER TABLE public.shopping_list_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shopping list checks"
  ON public.shopping_list_checks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER shopping_list_checks_set_updated_at
  BEFORE UPDATE ON public.shopping_list_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX shopping_list_checks_user_idx ON public.shopping_list_checks(user_id);

-- ------------------------------------------------------------
-- 20260706013902_19b31023-d45a-4019-b9a7-72060f68868c.sql
-- ------------------------------------------------------------
CREATE TABLE public.shopping_list_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'check_only',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, invited_email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_shares TO authenticated;
GRANT ALL ON public.shopping_list_shares TO service_role;

ALTER TABLE public.shopping_list_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages shares"
  ON public.shopping_list_shares
  FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Invitee can view own shares"
  ON public.shopping_list_shares
  FOR SELECT
  USING (auth.uid() = invited_user_id);

CREATE TRIGGER shopping_list_shares_set_updated_at
  BEFORE UPDATE ON public.shopping_list_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX shopping_list_shares_owner_idx ON public.shopping_list_shares(owner_user_id);
CREATE INDEX shopping_list_shares_email_idx ON public.shopping_list_shares(lower(invited_email));
CREATE INDEX shopping_list_shares_invited_user_idx ON public.shopping_list_shares(invited_user_id);

-- Helper (created AFTER the table so it can reference it)
CREATE OR REPLACE FUNCTION public.has_list_access(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shopping_list_shares
    WHERE owner_user_id = _owner
      AND invited_user_id = _viewer
      AND status = 'accepted'
  );
$$;

-- Extend handle_new_user to link pending invites by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));

  UPDATE public.shopping_list_shares
     SET invited_user_id = NEW.id,
         status = 'accepted',
         updated_at = now()
   WHERE invited_user_id IS NULL
     AND lower(invited_email) = lower(NEW.email);

  RETURN NEW;
END;
$$;

-- Expand policies on shopping_list_items to allow accepted members to READ
DROP POLICY IF EXISTS "Users manage own shopping list" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Users can view own shopping list" ON public.shopping_list_items;
DROP POLICY IF EXISTS "shopping_list_items_owner" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Users can manage own shopping list items" ON public.shopping_list_items;

CREATE POLICY "Owner manages shopping list items"
  ON public.shopping_list_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can view shared shopping list items"
  ON public.shopping_list_items
  FOR SELECT
  USING (public.has_list_access(user_id, auth.uid()));

-- Expand policies on shopping_list_checks to allow accepted members full check control
DROP POLICY IF EXISTS "Users manage own shopping list checks" ON public.shopping_list_checks;

CREATE POLICY "Owner or member checks - select"
  ON public.shopping_list_checks
  FOR SELECT
  USING (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner or member checks - insert"
  ON public.shopping_list_checks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner or member checks - update"
  ON public.shopping_list_checks
  FOR UPDATE
  USING (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner or member checks - delete"
  ON public.shopping_list_checks
  FOR DELETE
  USING (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

-- Realtime
ALTER TABLE public.shopping_list_items REPLICA IDENTITY FULL;
ALTER TABLE public.shopping_list_checks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_checks;

-- ------------------------------------------------------------
-- 20260706013917_32c23ab3-f3c2-4b72-a44e-3539ac64be2f.sql
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 20260706101843_1c338bf5-989c-4cfd-a5cc-4f37256849db.sql
-- ------------------------------------------------------------
ALTER TABLE public.shopping_list_shares ADD COLUMN share_token UUID;

UPDATE public.shopping_list_shares SET share_token = gen_random_uuid() WHERE share_token IS NULL;

ALTER TABLE public.shopping_list_shares ALTER COLUMN share_token SET NOT NULL;
ALTER TABLE public.shopping_list_shares ADD CONSTRAINT shopping_list_shares_share_token_unique UNIQUE (share_token);
ALTER TABLE public.shopping_list_shares ALTER COLUMN share_token SET DEFAULT gen_random_uuid();

CREATE INDEX shopping_list_shares_token_idx ON public.shopping_list_shares(share_token);

-- ------------------------------------------------------------
-- 20260706124836_cd962b59-382d-4169-b67b-1a36417521c8.sql
-- ------------------------------------------------------------
-- 1) Harden has_list_access: require caller to be authenticated AND to be the _viewer
CREATE OR REPLACE FUNCTION public.has_list_access(_owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _viewer = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.shopping_list_shares
       WHERE owner_user_id = _owner
         AND invited_user_id = _viewer
         AND status = 'accepted'
     );
$$;

-- Remove execute from anon/public; keep for authenticated + service_role
REVOKE ALL ON FUNCTION public.has_list_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_list_access(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) TO authenticated, service_role;

-- 2) shopping_list_checks: recreate policies scoped to authenticated role
DROP POLICY IF EXISTS "Owner or member checks - select" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Owner or member checks - insert" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Owner or member checks - update" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Owner or member checks - delete" ON public.shopping_list_checks;

CREATE POLICY "Owner or member checks - select"
  ON public.shopping_list_checks FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner or member checks - insert"
  ON public.shopping_list_checks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner or member checks - update"
  ON public.shopping_list_checks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner or member checks - delete"
  ON public.shopping_list_checks FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_list_access(user_id, auth.uid()));

-- 3) shopping_list_items: recreate policies scoped to authenticated role
DROP POLICY IF EXISTS "Members can view shared shopping list items" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Owner manages shopping list items" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Users manage own shopping list items" ON public.shopping_list_items;

CREATE POLICY "Members can view shared shopping list items"
  ON public.shopping_list_items FOR SELECT TO authenticated
  USING (public.has_list_access(user_id, auth.uid()));

CREATE POLICY "Owner manages shopping list items"
  ON public.shopping_list_items FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4) shopping_list_shares: scope to authenticated
DROP POLICY IF EXISTS "Invitee can view own shares" ON public.shopping_list_shares;
DROP POLICY IF EXISTS "Owner manages shares" ON public.shopping_list_shares;

CREATE POLICY "Invitee can view own shares"
  ON public.shopping_list_shares FOR SELECT TO authenticated
  USING (auth.uid() = invited_user_id);

CREATE POLICY "Owner manages shares"
  ON public.shopping_list_shares FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- 5) ingredients: keep read for authenticated; restrict writes to service_role only
DROP POLICY IF EXISTS "Authenticated can add ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Authenticated can update ingredients" ON public.ingredients;
DROP POLICY IF EXISTS "Ingredients viewable by authenticated" ON public.ingredients;

CREATE POLICY "Ingredients viewable by authenticated"
  ON public.ingredients FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Service role manages ingredients"
  ON public.ingredients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 20260706125536_75676696-a396-4e6f-ba7b-72386dc67255.sql
-- ------------------------------------------------------------
-- ==========================================================================
-- 1) New shopping_lists table
-- ==========================================================================
CREATE TABLE public.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Nova lista',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT ALL ON public.shopping_lists TO service_role;

CREATE TRIGGER shopping_lists_set_updated_at
BEFORE UPDATE ON public.shopping_lists
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================================================
-- 2) Add nullable list_id
-- ==========================================================================
ALTER TABLE public.shopping_list_items  ADD COLUMN list_id uuid REFERENCES public.shopping_lists(id) ON DELETE CASCADE;
ALTER TABLE public.shopping_list_checks ADD COLUMN list_id uuid REFERENCES public.shopping_lists(id) ON DELETE CASCADE;
ALTER TABLE public.shopping_list_shares ADD COLUMN list_id uuid REFERENCES public.shopping_lists(id) ON DELETE CASCADE;

-- ==========================================================================
-- 3) Backfill "Lista principal" per owner
-- ==========================================================================
INSERT INTO public.shopping_lists (owner_user_id, name)
SELECT uid, 'Lista principal' FROM (
  SELECT DISTINCT user_id AS uid FROM public.shopping_list_items
  UNION
  SELECT DISTINCT user_id FROM public.shopping_list_checks
  UNION
  SELECT DISTINCT owner_user_id FROM public.shopping_list_shares
) o;

UPDATE public.shopping_list_items i SET list_id = l.id
FROM public.shopping_lists l
WHERE l.owner_user_id = i.user_id AND l.name = 'Lista principal' AND i.list_id IS NULL;

UPDATE public.shopping_list_checks c SET list_id = l.id
FROM public.shopping_lists l
WHERE l.owner_user_id = c.user_id AND l.name = 'Lista principal' AND c.list_id IS NULL;

UPDATE public.shopping_list_shares s SET list_id = l.id
FROM public.shopping_lists l
WHERE l.owner_user_id = s.owner_user_id AND l.name = 'Lista principal' AND s.list_id IS NULL;

ALTER TABLE public.shopping_list_items  ALTER COLUMN list_id SET NOT NULL;
ALTER TABLE public.shopping_list_checks ALTER COLUMN list_id SET NOT NULL;
ALTER TABLE public.shopping_list_shares ALTER COLUMN list_id SET NOT NULL;

ALTER TABLE public.shopping_list_items  DROP CONSTRAINT shopping_list_items_user_id_recipe_id_key;
ALTER TABLE public.shopping_list_items  ADD  CONSTRAINT shopping_list_items_list_recipe_key UNIQUE (list_id, recipe_id);

ALTER TABLE public.shopping_list_checks DROP CONSTRAINT shopping_list_checks_user_id_ingredient_id_unit_key;
ALTER TABLE public.shopping_list_checks ADD  CONSTRAINT shopping_list_checks_list_ingredient_unit_key UNIQUE (list_id, ingredient_id, unit);

ALTER TABLE public.shopping_list_shares DROP CONSTRAINT shopping_list_shares_owner_user_id_invited_email_key;
ALTER TABLE public.shopping_list_shares ADD  CONSTRAINT shopping_list_shares_list_email_key UNIQUE (list_id, invited_email);

CREATE INDEX IF NOT EXISTS shopping_list_items_list_id_idx  ON public.shopping_list_items(list_id);
CREATE INDEX IF NOT EXISTS shopping_list_checks_list_id_idx ON public.shopping_list_checks(list_id);
CREATE INDEX IF NOT EXISTS shopping_list_shares_list_id_idx ON public.shopping_list_shares(list_id);

-- ==========================================================================
-- 4) Drop policies that depend on old has_list_access, then swap the function
-- ==========================================================================
DROP POLICY IF EXISTS "Members can view shared shopping list items" ON public.shopping_list_items;
DROP POLICY IF EXISTS "Owner manages shopping list items"           ON public.shopping_list_items;
DROP POLICY IF EXISTS "Owner or member checks - select" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Owner or member checks - insert" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Owner or member checks - update" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Owner or member checks - delete" ON public.shopping_list_checks;
DROP POLICY IF EXISTS "Invitee can view own shares" ON public.shopping_list_shares;
DROP POLICY IF EXISTS "Owner manages shares"        ON public.shopping_list_shares;

DROP FUNCTION IF EXISTS public.has_list_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.has_list_access(_list_id uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND _viewer = auth.uid()
     AND (
       EXISTS (SELECT 1 FROM public.shopping_lists WHERE id = _list_id AND owner_user_id = _viewer)
       OR EXISTS (
         SELECT 1 FROM public.shopping_list_shares
         WHERE list_id = _list_id AND invited_user_id = _viewer AND status = 'accepted'
       )
     );
$$;

REVOKE ALL ON FUNCTION public.has_list_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_list_access(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_list_access(uuid, uuid) TO authenticated, service_role;

-- ==========================================================================
-- 5) RLS policies
-- ==========================================================================
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view accessible lists"
  ON public.shopping_lists FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.shopping_list_shares s
      WHERE s.list_id = shopping_lists.id
        AND s.invited_user_id = auth.uid()
        AND s.status = 'accepted'
    )
  );

CREATE POLICY "Owner manages own lists"
  ON public.shopping_lists FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- shopping_list_items
CREATE POLICY "Members can view list items"
  ON public.shopping_list_items FOR SELECT TO authenticated
  USING (public.has_list_access(list_id, auth.uid()));

CREATE POLICY "Owner manages list items"
  ON public.shopping_list_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shopping_lists l WHERE l.id = list_id AND l.owner_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shopping_lists l WHERE l.id = list_id AND l.owner_user_id = auth.uid()));

-- shopping_list_checks
CREATE POLICY "Members can view checks"
  ON public.shopping_list_checks FOR SELECT TO authenticated
  USING (public.has_list_access(list_id, auth.uid()));

CREATE POLICY "Members can insert checks"
  ON public.shopping_list_checks FOR INSERT TO authenticated
  WITH CHECK (public.has_list_access(list_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Members can update checks"
  ON public.shopping_list_checks FOR UPDATE TO authenticated
  USING (public.has_list_access(list_id, auth.uid()))
  WITH CHECK (public.has_list_access(list_id, auth.uid()));

CREATE POLICY "Members can delete checks"
  ON public.shopping_list_checks FOR DELETE TO authenticated
  USING (public.has_list_access(list_id, auth.uid()));

-- shopping_list_shares
CREATE POLICY "Invitee can view own shares"
  ON public.shopping_list_shares FOR SELECT TO authenticated
  USING (invited_user_id = auth.uid());

CREATE POLICY "Owner manages shares"
  ON public.shopping_list_shares FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- ------------------------------------------------------------
-- 20260706130156_77703418-a052-4e19-b81d-c627da495528.sql
-- ------------------------------------------------------------
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS author text;
CREATE INDEX IF NOT EXISTS recipes_author_idx ON public.recipes (author);

-- ------------------------------------------------------------
-- 20260706130820_f1c58564-a82c-47ca-8c95-903f83e01a94.sql
-- ------------------------------------------------------------
CREATE TABLE public.import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host text NOT NULL,
  site_key text NOT NULL,
  path_includes text[] NOT NULL DEFAULT '{}',
  search text,
  is_active boolean NOT NULL DEFAULT true,
  exhausted boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, site_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_sources TO authenticated;
GRANT ALL ON public.import_sources TO service_role;

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sources" ON public.import_sources
  FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Users insert own sources" ON public.import_sources
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users update own sources" ON public.import_sources
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users delete own sources" ON public.import_sources
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER import_sources_updated_at
  BEFORE UPDATE ON public.import_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX import_sources_due_idx
  ON public.import_sources (is_active, exhausted, last_run_at NULLS FIRST);

-- ------------------------------------------------------------
-- 20260706145636_dbcd4515-3c61-44c2-bbc6-17c76ce86285.sql
-- ------------------------------------------------------------
-- Recurring import job (every 30 min). Requires the pg_cron and pg_net
-- extensions. On a fresh project enable them first (see MIGRAR-SUPABASE.md):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- Replace YOUR_APP_URL with your deployed URL and YOUR_SUPABASE_ANON_KEY with
-- your project's anon key.

-- Guarded so it doesn't fail on a fresh project where the job doesn't exist yet.
DO $$
BEGIN
  PERFORM cron.unschedule('import-recipes-30min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'import-recipes-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_APP_URL/api/public/hooks/import-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'YOUR_SUPABASE_ANON_KEY'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ------------------------------------------------------------
-- 20260706152106_672c92cb-0894-4030-80a3-91b011ea8179.sql
-- ------------------------------------------------------------
-- Deduplicate recipes by source_url (keep oldest), then prevent future dupes.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY source_url ORDER BY created_at ASC, id ASC) AS rn
  FROM public.recipes
  WHERE source_url IS NOT NULL
)
DELETE FROM public.recipes r USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_url_unique
  ON public.recipes (source_url)
  WHERE source_url IS NOT NULL;

-- ------------------------------------------------------------
-- 20260706215013_0249da0c-acfe-4e4b-b5a4-9f3437409985.sql
-- ------------------------------------------------------------
-- Delete Jamie Oliver "recipes" that are duplicates (hub pages scraped as recipes).
-- Keep only rows whose title appears exactly once for this site (real recipes),
-- since hub pages all collapsed onto "Mushroom stew" and a couple of others.
DELETE FROM public.recipes
WHERE source_site = 'jamieoliver.com'
  AND (
    title IN ('Mushroom stew', 'Receita sem título')
    OR source_url ~ '^https?://[^/]+/recipes/(ingredients|magazine|together|curry-night|haddock|pastry|gnocchi|cupcake|beef-brisket|halloween-baking|brussels-sprouts|jamies-ultimate-bbq|hot-cross-buns|roast-potato)(/|$)'
    OR source_url ~ '^https?://[^/]+/recipes/(tv|course|christmas|family-favourites|dishtype|world|books|beef|fish|mushroom|baking|dessert)/[^/]+$'
       AND source_url !~ '-'
  );

-- Also remove exact-title duplicates keeping the newest row (safety net).
DELETE FROM public.recipes r1
USING public.recipes r2
WHERE r1.source_site = 'jamieoliver.com'
  AND r2.source_site = 'jamieoliver.com'
  AND r1.title = r2.title
  AND r1.created_at < r2.created_at;

-- Reset the import source so the cron picks it up again with the new guard.
UPDATE public.import_sources
SET exhausted = false, last_run_at = NULL, last_result = NULL
WHERE site_key = 'jamieoliver.com';
