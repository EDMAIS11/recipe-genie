ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS author text;
CREATE INDEX IF NOT EXISTS recipes_author_idx ON public.recipes (author);