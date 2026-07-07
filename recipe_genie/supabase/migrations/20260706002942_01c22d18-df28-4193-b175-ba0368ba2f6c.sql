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
