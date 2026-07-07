# Onde configurar o Supabase e as chaves de API

Resposta curta: **não é no GitHub.** O GitHub só guarda o código. As chaves vão
para dois sítios diferentes, conforme onde a app corre.

## Regra base

- O ficheiro `.env` **nunca** vai para o GitHub (está no `.gitignore`, de
  propósito — se lá estivesse, qualquer pessoa com acesso ao repositório via as
  tuas chaves).
- **Desenvolvimento** (no teu PC) → editas o `.env` local.
- **Produção** (app online no Netlify) → variáveis no painel do Netlify.

Os valores são os mesmos nos dois sítios; muda só o local onde os pões.

## A. No teu computador (desenvolvimento)

Na pasta do projeto, abre o ficheiro `.env` num editor de texto e preenche:

```
# Supabase (o teu projeto — ver MIGRAR-SUPABASE.md)
SUPABASE_URL="https://O_TEU_PROJETO.supabase.co"
SUPABASE_PROJECT_ID="o-teu-project-id"
SUPABASE_PUBLISHABLE_KEY="a-tua-anon-key"
SUPABASE_SERVICE_ROLE_KEY="a-tua-service-role-key"
VITE_SUPABASE_URL="https://O_TEU_PROJETO.supabase.co"
VITE_SUPABASE_PROJECT_ID="o-teu-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="a-tua-anon-key"

# IA — Google Gemini (aistudio.google.com)
AI_API_KEY="a-tua-key-do-google"
AI_GATEWAY_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
AI_MODEL="gemini-2.5-flash"

# Scraping — Jina (opcional; jina.ai)
JINA_API_KEY="a-tua-key-jina-ou-vazio"
```

De onde vêm os valores:
- **Supabase** → painel do teu projeto em supabase.com, em
  **Project Settings → API** (URL, anon key, service_role key).
- **Google Gemini** → aistudio.google.com, cria uma API key.
- **Jina** → jina.ai (opcional; sem key funciona, só mais lento).

Depois testas com:

```bash
npm install
npm run dev
```

## B. No Netlify (produção)

O `.env` local não existe no servidor do Netlify. Lá, as chaves põem-se no
painel:

1. Netlify → o teu site → **Site settings → Environment variables**.
2. **Add a variable** para cada uma, com o mesmo nome e valor da lista acima
   (todas exceto as que não uses).
3. Guarda e faz um novo deploy (ou **Trigger deploy**) para as apanhar.

## Porque é que o GitHub fica de fora

O GitHub guarda o código, que é público dentro da tua equipa/conta. As chaves
são segredos. Misturar as duas coisas é o erro clássico de segurança — por isso
o `.env` está ignorado e os segredos vivem no `.env` local (só teu) e nas
variáveis do Netlify (só no servidor).

## Se alguma vez o `.env` for parar ao GitHub

Se por engano subir, considera as chaves comprometidas: roda-as (gera novas no
Supabase/Google/Jina) e remove o ficheiro do repositório. Confirma sempre com
`git status` antes de um commit que o `.env` não aparece na lista.
