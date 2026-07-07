# Passar do Supabase do Lovable para o teu

O projeto vinha ligado ao Supabase que o Lovable provisionou (o projeto
`dbmuwydijftleuqhltvo`, parte do "Lovable Cloud"). Estes passos passam a app para
um projeto Supabase **teu**. Já removi os valores do Lovable do `.env` — agora só
tens de preencher com os do teu projeto.

## 1. Cria o teu projeto Supabase

Em supabase.com, cria um projeto novo (ou usa um que já tenhas). Guarda a
password da base de dados que defines na criação.

## 2. Copia as chaves para o `.env`

No painel do teu projeto, em **Project Settings → API**, copia:

- **Project URL** → `SUPABASE_URL` e `VITE_SUPABASE_URL`
- **Project ID** (o subdomínio do URL) → `SUPABASE_PROJECT_ID` e `VITE_SUPABASE_PROJECT_ID`
- **anon / publishable key** → `SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (só servidor; nunca no cliente)

## 3. Recria o esquema (migrações)

Toda a estrutura (tabelas, RLS, funções) está em `supabase/migrations/`. Aplica-a
ao teu projeto novo. Com o [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref O_TEU_PROJECT_ID
supabase db push
```

Alternativa sem CLI: abre cada ficheiro `.sql` (por ordem de data no nome) no
**SQL Editor** do painel e corre-os um a um.

## 4. Ativa as extensões do cron (antes da migração do cron)

A migração `...145636...` agenda um job recorrente e precisa de duas extensões.
No **SQL Editor** corre primeiro:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

(No painel também dá para as ativar em **Database → Extensions**.) A migração já
está protegida para não falhar se o job ainda não existir.

## 5. Preenche os placeholders da migração do cron

No ficheiro `...145636...sql`, troca `YOUR_APP_URL` pelo URL onde a app vai
correr (ex.: o teu site do Netlify) e `YOUR_SUPABASE_ANON_KEY` pela tua anon key.

## 6. Configura a autenticação

Em **Authentication → Providers**, ativa o **Google** (a app usa OAuth Google
nativo do Supabase) e, em **URL Configuration → Redirect URLs**, adiciona:

- `http://localhost:5173/auth` (desenvolvimento)
- `https://<o-teu-site>.netlify.app/auth` (produção)

## 7. Confirma

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`, tenta criar uma conta por email e verifica no
painel do Supabase, em **Authentication → Users**, se o utilizador aparece — é o
sinal de que a app está ligada ao teu projeto.

## Nota sobre dados

Estes passos recriam a **estrutura** vazia. As receitas e preços que estavam no
projeto do Lovable não vêm — ou os voltas a importar pela app, ou exportas os
dados do projeto antigo (Supabase → Database) e importa-los no novo.

## Em produção (Netlify)

Repete os mesmos valores do `.env` em **Site settings → Environment variables**
no Netlify. O `.env` local serve para desenvolvimento; em produção quem manda são
as variáveis do Netlify.
