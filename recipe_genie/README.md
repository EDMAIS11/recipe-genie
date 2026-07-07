# Recipe Genie

Full-stack recipe app (TanStack Start + React 19 + Supabase) that imports
recipes and supermarket prices via Firecrawl and an AI model.

This codebase was originally built on Lovable and has been fully detached from
it. There are no `@lovable.dev/*` dependencies, no Lovable services, and no
`lovable.app` URLs.

## Setup

1. Install dependencies (npm, pnpm, or bun):

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   - **Supabase** — URL, anon (publishable) key, project id, and the
     server-only service-role key.
   - **AI provider** — `AI_API_KEY`, `AI_GATEWAY_URL`, `AI_MODEL`. Any
     OpenAI-compatible endpoint works. The default is OpenRouter, which keeps
     the existing `google/gemini-*` model IDs valid.
   - **Firecrawl** — `JINA_API_KEY` for recipe and price scraping.

3. Run the database migrations in `supabase/migrations` against your Supabase
   project (via the Supabase CLI or the SQL editor).

4. Start the dev server:

   ```bash
   npm run dev
   ```

## What changed when detaching from Lovable

- **Removed** `@lovable.dev/cloud-auth-js` and `@lovable.dev/vite-tanstack-config`
  from `package.json`; deleted `.lovable/`, `AGENTS.md`, `src/integrations/lovable/`,
  and the old error-reporting module. Lockfiles were removed so they regenerate
  clean on your next install.
- **`vite.config.ts`** now configures the TanStack Start / React / Tailwind /
  tsconfig-paths plugins explicitly instead of via the Lovable wrapper.
- **Auth** uses native Supabase OAuth (`supabase.auth.signInWithOAuth`). Enable
  the Google provider in your Supabase dashboard and add `<origin>/auth` to the
  allowed redirect URLs.
- **AI gateway** (`src/lib/ai-gateway.server.ts`) is now a generic
  OpenAI-compatible provider driven by `AI_API_KEY` / `AI_GATEWAY_URL` / `AI_MODEL`.
- **Error reporting** (`src/lib/error-reporting.ts`) logs to the console by
  default; wire in Sentry/PostHog there if you want.
- **SQL migration** and Open Graph tags had `lovable.app` URLs and a hardcoded
  anon key replaced with placeholders (`YOUR_APP_URL`, `YOUR_SUPABASE_ANON_KEY`,
  `/og-image.png`). Update the cron migration with your deployed URL and key.

## Deployment note

`vite.config.ts` builds with nitro. If you deploy somewhere other than Node,
set the nitro preset (e.g. `vercel`, `netlify`, `cloudflare-pages`).

## Stack decisions (this build)

- **Hosting:** Netlify (`netlify.toml` included).
- **AI:** Google Gemini free tier via its OpenAI-compatible endpoint
  (`AI_GATEWAY_URL` / `AI_MODEL`). Swap providers by changing those env vars.
- **Scraping:** Jina Reader (`src/lib/jina.server.ts`) — replaced Firecrawl.
  `JINA_API_KEY` is optional (higher rate limits). Recipe discovery uses each
  site's `sitemap.xml`; page scraping uses `r.jina.ai`; product search uses
  `s.jina.ai`.
- **Database + auth:** Supabase (unchanged).

Note on bulk import: Firecrawl's `map` (full-site crawl) was replaced by reading
the target site's `sitemap.xml`. If a site has no sitemap or hides recipe URLs
from it, adjust `discoverUrlsFromSitemap` or seed URLs another way.
