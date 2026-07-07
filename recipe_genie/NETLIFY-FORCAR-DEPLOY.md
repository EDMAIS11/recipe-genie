# Definições corretas — falta o deploy novo

As Build settings estão todas certas:

- Base directory: `recipe_genie` ✅
- Build command: `npm run build` ✅
- Publish directory: `recipe_genie/dist/client` ✅
- Functions directory: `recipe_genie/netlify/functions` ✅

O 404 que viste era de um deploy **anterior**, feito quando estas definições
ainda estavam erradas. O Netlify continua a servir esse deploy antigo até
fazeres um novo.

## Passo único agora

**Deploys → Trigger deploy → Clear cache and deploy site.**

Acompanha o log até ao fim.

## Como ler o resultado

**Se disser "Published" e o site abrir:** está resolvido.

**Se o log mostrar erro**, procura uma destas linhas e reage:

- `Missing environment variable` / erro do Supabase ao arrancar → faltam as
  variáveis. Confirma em **Environment variables** que importaste o `.env`
  (Supabase, AI, Jina) e volta a fazer deploy.
- Erro de build do Vite/Nitro → copia as últimas ~30 linhas e mostra-mas.
- `Functions bundling failed` → algo na função de servidor; copia o erro.

## Se "Published" mas ainda dá 404

Nesse caso o problema é o Nitro não estar a gerar a função de servidor para o
Netlify. Confirma no log que aparece menção a "nitro" com preset "netlify" e à
pasta de functions. O `netlify.toml` do projeto já força
`NITRO_PRESET = "netlify"`, por isso normalmente resolve — mas se não aparecer,
diz-me e ajustamos.

## Nota

A app foi validada localmente (arranca com `npm run dev`), por isso o que falta é
puramente o deploy correr com estas definições. O log do novo deploy é a peça
que confirma tudo.
