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
