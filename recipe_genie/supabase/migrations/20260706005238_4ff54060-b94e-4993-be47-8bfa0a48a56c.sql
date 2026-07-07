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