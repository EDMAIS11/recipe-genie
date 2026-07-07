
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
