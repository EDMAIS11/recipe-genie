# Onde vive cada ligação

Resposta rápida a "como é que o projeto sabe qual é o Supabase, o Netlify e o
GitHub?". Cada um funciona de maneira diferente.

## Supabase — no código, via variáveis de ambiente

A app liga-se ao projeto Supabase certo através do `.env`:

```
SUPABASE_URL="https://O_TEU_PROJETO.supabase.co"
SUPABASE_PUBLISHABLE_KEY="..."
```

O subdomínio do URL é o ID do projeto. Os valores do Supabase que o Lovable
tinha provisionado já foram removidos — tens de pôr aqui os do **teu** projeto
(vê o `MIGRAR-SUPABASE.md`). É só isto que define qual o Supabase usado, tanto
localmente (`.env`) como em produção (variáveis no painel do Netlify).

**Começa vazio** — preenche com o teu projeto.

## Netlify — no painel do Netlify, não no código

O `netlify.toml` só diz *como* construir a app (comando de build, preset). Não
diz *qual* site. A ligação faz-se assim:

1. No painel do Netlify: **Add new site → Import an existing project → GitHub**.
2. Escolhes o repositório. O Netlify cria o site e fica ligado a esse repo.
3. Em **Site settings → Environment variables**, pões as chaves de produção
   (as mesmas do `.env`).

**Começa vazio** — não há nenhum site pré-configurado; crias tu.

## GitHub — defines tu com `git remote`

Não há nenhum repositório baked-in no projeto. Ligas assim:

```
git init
git add .
git commit -m "primeira versão"
git remote add origin https://github.com/<teu-utilizador>/recipe-genie.git
git branch -M main
git push -u origin main
```

O `git remote add origin ...` é o que define para onde o código vai. Até
correres isto, é um projeto local sem ligação a lado nenhum.

**Começa vazio** — crias o repositório no GitHub e apontas tu.

## Resumo

| Serviço  | Onde está a ligação        | Estado inicial                    |
|----------|----------------------------|-----------------------------------|
| Supabase | `.env` (URL + chave)       | Vazio — liga ao teu projeto novo  |
| Netlify  | Painel do Netlify (UI)     | Vazio — ligas ao repo GitHub      |
| GitHub   | `git remote add origin`    | Vazio — crias o repo e apontas    |

A ordem natural: primeiro liga o Supabase ao teu projeto (vê o
`MIGRAR-SUPABASE.md`), depois põe o código no GitHub, e por fim liga o Netlify ao
repo do GitHub.
