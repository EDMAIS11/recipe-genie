
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
