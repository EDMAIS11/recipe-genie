# Deploy — GitHub + Netlify

## 1. Pôr o projeto no GitHub

Dentro da pasta `recipe_genie`:

```bash
git init
git add .
git commit -m "Recipe Genie — versão sem Lovable"
```

Cria um repositório vazio no GitHub (de preferência **privado**, porque o `.env`
tem valores teus), depois:

```bash
git remote add origin https://github.com/<utilizador>/recipe-genie.git
git branch -M main
git push -u origin main
```

O `.gitignore` já ignora `.env`, `node_modules` e `dist`, por isso os segredos
não vão para o GitHub — vais configurá-los no Netlify (passo 3).

## 2. Ligar o Netlify ao repositório

No Netlify: **Add new site → Import an existing project → GitHub** e escolhe o
repositório. O `netlify.toml` já define o comando de build (`npm run build`), o
preset do Nitro (`netlify`) e a versão do Node. Cada `git push` para `main`
passa a fazer deploy sozinho.

## 3. Definir as variáveis de ambiente no Netlify

Em **Site settings → Environment variables**, adiciona:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `AI_API_KEY`, `AI_GATEWAY_URL`, `AI_MODEL`
- `JINA_API_KEY`

(Os valores são os mesmos do teu `.env` local.)

## 4. Depois do primeiro deploy

- Adiciona o URL do site (`https://<o-teu-site>.netlify.app/auth`) aos
  **Redirect URLs** do Google em *Authentication → Providers* no Supabase.
- Atualiza a migração do cron (`supabase/migrations/...145636...sql`),
  substituindo `YOUR_APP_URL` e `YOUR_SUPABASE_ANON_KEY` pelos valores reais,
  e corre-a no teu projeto Supabase.

## O que o GitHub e o Netlify substituem (e o que não)

- **GitHub** substitui o histórico de versões que tinhas dentro do Lovable.
- **Netlify** substitui o alojamento — corre a app e transforma o SSR numa
  Netlify Function.
- **Não** substituem: Supabase (base de dados + autenticação), o modelo de IA
  (OpenRouter ou outro), nem o Firecrawl. Essas chaves continuam a ser precisas.
