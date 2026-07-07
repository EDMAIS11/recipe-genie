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
