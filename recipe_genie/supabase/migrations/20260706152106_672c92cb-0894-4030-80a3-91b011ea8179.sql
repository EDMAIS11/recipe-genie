
-- Deduplicate recipes by source_url (keep oldest), then prevent future dupes.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY source_url ORDER BY created_at ASC, id ASC) AS rn
  FROM public.recipes
  WHERE source_url IS NOT NULL
)
DELETE FROM public.recipes r USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_url_unique
  ON public.recipes (source_url)
  WHERE source_url IS NOT NULL;
