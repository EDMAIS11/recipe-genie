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
