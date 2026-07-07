# .env local vs Netlify — os dois, mas em momentos diferentes

Pergunta: devo preencher o `.env` com `nano`, ou fazer no Netlify? **Os dois** —
porque servem sítios diferentes:

- **`.env` local** → a app a correr no **teu PC** (`npm run dev`). Para testar.
- **Netlify (Environment variables)** → a app a correr **online**.

Um não substitui o outro: o Netlify não lê o teu `.env` local, e o teu PC não lê
as variáveis do Netlify. Os **valores são os mesmos** nos dois; muda só onde os
escreves.

## Ordem recomendada

### Passo 0 (pré-requisito) — Supabase com tabelas
Antes de qualquer teste, o teu projeto Supabase novo tem de ter as tabelas
criadas pelas migrações (ver `MIGRAR-SUPABASE.md`). Sem isto, mesmo com o `.env`
certo a app dá erro por não encontrar as tabelas.

### Passo 1 — Testar no teu PC
```bash
cd /home/eduardo-silva/Transferências/Recipe_Genie_clean/recipe_genie
nano .env        # preenche os valores, grava com Ctrl+O, sai com Ctrl+X
npm install
npm run dev
```
Abre `http://localhost:5173` e confirma que arranca e que consegues criar conta.
Testar aqui é mais rápido para apanhar erros de configuração.

### Passo 2 — Replicar no Netlify
Quando funcionar localmente, copia os **mesmos** valores para
**Netlify → Site settings → Environment variables**, e faz um novo deploy
(**Trigger deploy**) para ele os apanhar.

## Atalho (se não quiseres testar localmente)

Podes saltar o `.env` local e pôr as chaves só no Netlify. Só que, se algo
falhar, é mais difícil saber se é configuração ou código — por isso o teste
local primeiro poupa dores de cabeça.

## Resumo

| Onde        | Para quê            | Quando                          |
|-------------|---------------------|---------------------------------|
| `.env` local| App no teu PC       | Ao testar com `npm run dev`     |
| Netlify     | App online          | Depois, para publicar           |

Regra prática: preenche o `.env`, confirma local, e só depois replica no
Netlify. Assim, se houver erro, sabes que é configuração e não código.
