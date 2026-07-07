# Corrigir o 404 — a app SSR não tinha servidor no Netlify

## O que o log revelou

O build **não falhou** ("Site is live"), mas tinha esta linha decisiva:

```
11 new file(s) to upload
0 new function(s) to upload
```

**Zero funções.** Esta app é renderizada no servidor (SSR): precisa de um
servidor a responder às páginas. O build gerou os ficheiros estáticos
(`dist/client`) e um servidor universal (`dist/server/server.js`), mas o Netlify
não recebeu nenhuma função para o executar. Sem servidor, as rotas dão 404.

Causa: nesta versão do TanStack Start, o `vite build` sozinho não empacota o
servidor como função Netlify (testei — nem com `NITRO_PRESET` nem com
`target: "netlify"` aparece função). O wrapper do Lovable que removemos tratava
disto nos bastidores.

## A correção (já feita e validada)

Em vez de depender do empacotamento automático, adicionei uma **Netlify Function
nativa** que serve o handler SSR, mais um redirect que manda todas as rotas para
ela. Testei localmente: o handler responde HTTP 200 com o HTML da app
("Cozinha IA") em `/` e em `/auth`.

Ficheiros novos/alterados:

- `netlify/functions/server.mjs` — a função que carrega `dist/server/server.js` e
  serve todos os pedidos.
- `netlify.toml` — passa a declarar a função, inclui o `dist/server` no pacote, e
  redireciona `/*` para a função (deixando os ficheiros estáticos serem servidos
  primeiro).

## Como aplicar no teu repositório

Tens duas opções.

### Opção A — voltar a descarregar o zip (mais simples)

1. Descarrega o novo zip que te dou no chat.
2. Substitui a tua pasta `recipe_genie` pela nova.
3. Na pasta, faz commit e push:
   ```bash
   git add .
   git commit -m "SSR: servir via Netlify Function (corrige 404)"
   git push
   ```

### Opção B — mexer só nos dois ficheiros (sem redescarregar)

Se preferires não trocar a pasta toda, só precisas de:

1. Criar a pasta e o ficheiro `netlify/functions/server.mjs` com o conteúdo que
   está no zip.
2. Substituir o `netlify.toml` pelo novo.
3. `git add . && git commit -m "SSR via Netlify Function" && git push`.

## O que acontece a seguir

O push dispara um deploy automático. Desta vez, no log do deploy, procura:

```
X new function(s) to upload
```

Se disser **1 function** (em vez de 0), está resolvido — abre o site e a app
aparece.

## Se ainda assim falhar

Copia o novo log do deploy (as linhas com "function", "bundling" ou qualquer
erro) e mostra-mo. O ponto a confirmar é sempre o mesmo: o Netlify tem de
carregar 1 função, não 0.
