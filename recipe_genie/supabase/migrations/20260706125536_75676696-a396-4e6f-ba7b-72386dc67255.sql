
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
