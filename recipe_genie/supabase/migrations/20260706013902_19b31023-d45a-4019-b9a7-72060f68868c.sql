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
