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