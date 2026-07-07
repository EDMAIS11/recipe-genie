# Ligar o Netlify ao GitHub

O código está no repositório `EDMAIS11/recipe-genie`, mas dentro da subpasta
`recipe_genie/`. Por isso, ao configurar o Netlify, tens de indicar essa pasta
como **Base directory** — é o ponto mais importante deste guia.

## 1. Criar o site a partir do GitHub

1. Entra em app.netlify.com (cria conta com o GitHub, é o mais simples).
2. **Add new site → Import an existing project**.
3. Escolhe **GitHub** e autoriza o Netlify a aceder aos teus repositórios.
   Podes dar acesso só ao `recipe-genie`.
4. Na lista, seleciona o repositório **recipe-genie**.

## 2. Definições de build (o passo crítico)

Na página de configuração antes do deploy, preenche:

- **Base directory:** `recipe_genie`
- **Build command:** `npm run build`
- **Publish directory:** `recipe_genie/dist/client`

(Se o Netlify já preencher o Build command e o Publish sozinho a partir do
`netlify.toml`, confirma que o **Base directory** está mesmo em `recipe_genie` —
é isso que faz o resto encaixar.)

## 3. Variáveis de ambiente

Ainda antes do primeiro deploy, ou logo a seguir em
**Site settings → Environment variables**, adiciona as tuas chaves (as mesmas do
`.env` — ver `CONFIGURAR-CHAVES.md`):

```
SUPABASE_URL
SUPABASE_PROJECT_ID
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
AI_API_KEY
AI_GATEWAY_URL
AI_MODEL
JINA_API_KEY
```

Sem estas, o build pode passar mas a app dá erro ao arrancar (falta o Supabase).

## 4. Deploy

Clica em **Deploy**. Acompanha o registo em **Deploys → (o deploy em curso) →
building**. Se falhar, o erro aparece aí — normalmente é o Base directory errado
ou uma variável em falta.

## 5. Depois do primeiro deploy

O Netlify dá-te um URL do tipo `https://<nome-aleatorio>.netlify.app`. Com esse
URL:

1. **Supabase → Authentication → URL Configuration → Redirect URLs:** adiciona
   `https://<o-teu-site>.netlify.app/auth`.
2. **Migração do cron** (`supabase/migrations/...145636...sql`): troca
   `YOUR_APP_URL` por `https://<o-teu-site>.netlify.app` e
   `YOUR_SUPABASE_ANON_KEY` pela tua anon key, e corre-a no Supabase.

## A partir daqui

Cada `git push` para a `main` dispara um deploy automático. Não precisas de
voltar a configurar nada.

## Nota

Se preferires não usar o Base directory e ter o `package.json` na raiz do
repositório, dá para reorganizar o repositório (mover o conteúdo de
`recipe_genie/` para a raiz). Pede-me os comandos se quiseres seguir por aí — mas
o Base directory resolve isto sem mexer no repositório.
