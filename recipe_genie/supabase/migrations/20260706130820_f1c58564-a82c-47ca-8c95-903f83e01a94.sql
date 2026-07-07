CREATE TABLE public.import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host text NOT NULL,
  site_key text NOT NULL,
  path_includes text[] NOT NULL DEFAULT '{}',
  search text,
  is_active boolean NOT NULL DEFAULT true,
  exhausted boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, site_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_sources TO authenticated;
GRANT ALL ON public.import_sources TO service_role;

ALTER TABLE public.import_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sources" ON public.import_sources
  FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Users insert own sources" ON public.import_sources
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users update own sources" ON public.import_sources
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users delete own sources" ON public.import_sources
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER import_sources_updated_at
  BEFORE UPDATE ON public.import_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX import_sources_due_idx
  ON public.import_sources (is_active, exhausted, last_run_at NULLS FIRST);