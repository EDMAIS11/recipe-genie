# Netlify mostra "Page not found" (404)

O site está no ar mas dá 404. Quase sempre é um problema de configuração do
build — e no teu caso a causa mais provável é o **Base directory**, porque o
código está na subpasta `recipe_genie/` do repositório.

## Passo 1 — Ver o que aconteceu no deploy

No Netlify: **Deploys** → abre o último deploy e lê o log.

- Se disser **Failed**, ou o log mencionar "package.json not found" / "build
  command failed" → é o **Base directory** (o Netlify procurou na raiz e não
  encontrou o projeto).
- Se disser **Published** mas o site dá 404 → o build correu mas publicou a
  pasta errada → é o **Publish directory**.

## Passo 2 — Corrigir as definições de build

**Site configuration → Build & deploy → Build settings → Edit settings:**

- **Base directory:** `recipe_genie`
- **Build command:** `npm run build`
- **Publish directory:** `recipe_genie/dist/client`

Grava.

## Passo 3 — Forçar novo deploy

**Deploys → Trigger deploy → Clear cache and deploy site.**

O "Clear cache" garante que ele reconstrói do zero com as definições novas.
Acompanha o log; quando disser "Published", abre o site outra vez.

## Se continuar a dar 404 depois disto

**Verifica se o build gerou a função de servidor.** Esta app é renderizada no
servidor (SSR) — não é só HTML estático. O Nitro tem de gerar uma Netlify
Function. Confirma no log do deploy que aparece algo sobre "functions" ou
"nitro" e o preset netlify. Se não aparecer, confirma que o `netlify.toml` tem
`NITRO_PRESET = "netlify"` (já vem no projeto).

**Confirma o publish directory real.** No log do build, o Nitro/Vite diz onde
escreveu o cliente. Se o caminho for diferente de `recipe_genie/dist/client`,
ajusta o Publish directory para esse caminho.

**Variáveis de ambiente.** Se o build falhar por falta de variáveis, confirma
que importaste o `.env` (Site settings → Environment variables) e volta a fazer
deploy.

## Nota

O 404 é de configuração de deploy, não do código — a app foi validada e arranca
localmente com `npm run dev`. Assim que o Base/Publish directory estiverem
certos, o site aparece.

Se depois de tudo isto continuar, copia as últimas ~30 linhas do log do deploy
que eu digo-te exatamente o que ajustar.
