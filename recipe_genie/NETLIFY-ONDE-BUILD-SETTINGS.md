# Onde estão as Build settings (a partir deste menu)

Estás em **Project configuration**. O caminho é:

## 1. Abrir as definições de build

**Build & deploy → Continuous deployment**

(Não é o "Post processing" nem o "Build plugins" — é o **Continuous
deployment**.)

Nessa página, desce até à secção **Build settings** e clica em **Configure** /
**Edit settings**.

## 2. Preencher

- **Base directory:** `recipe_genie`
- **Build command:** `npm run build`
- **Publish directory:** `recipe_genie/dist/client`

Grava (**Save**).

## 3. Confirmar as variáveis (se ainda não o fizeste)

No mesmo menu lateral: **Environment variables** — confirma que lá estão as
chaves do `.env` (Supabase, AI, Jina).

## 4. Forçar novo deploy

No topo, muda de **Project configuration** para **Deploys** →
**Trigger deploy** → **Clear cache and deploy site**.

Acompanha o log. Quando disser **Published**, abre `refeicoes-ia.netlify.app`
outra vez — o 404 deve desaparecer.

## Se o deploy falhar no log

Copia as últimas ~30 linhas do log e mostra-mas. Os erros mais comuns aqui:

- "package.json not found" → o **Base directory** não ficou em `recipe_genie`.
- Erro sobre variável em falta → falta importar o `.env` nas Environment
  variables.
- Caminho de publish diferente → ajusta o **Publish directory** para o que o log
  indicar.
