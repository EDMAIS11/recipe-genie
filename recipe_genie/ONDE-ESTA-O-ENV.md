# Onde está o .env e como o editar

## Localização

O `.env` está na raiz da pasta do projeto, ao lado do `package.json`:

```
/home/eduardo-silva/Transferências/Recipe_Genie_clean/recipe_genie/.env
```

## Porque é que talvez não o vejas

**1. É um ficheiro escondido.** Começa por um ponto (`.env`), e no Linux esses
ficheiros estão ocultos por defeito.

- No explorador de ficheiros: **Ctrl+H** para mostrar/esconder ocultos.
- No terminal: usa `ls -a` (não o `ls` simples).

```bash
cd /home/eduardo-silva/Transferências/Recipe_Genie_clean/recipe_genie
ls -a
```

Deves ver `.env`, `.env.example` e `.gitignore` na lista.

**2. Não está no GitHub.** De propósito — o `.gitignore` exclui-o para as tuas
chaves não ficarem expostas. Só existe na tua pasta local; é aí que o editas.

## Como editar

Escolhe uma forma:

- **VS Code:** `code .env`
- **Editor gráfico:** `gedit .env`
- **Terminal (nano):** `nano .env` — gravas com **Ctrl+O** (Enter) e sais com
  **Ctrl+X**.

## O que preencher

Vê o `CONFIGURAR-CHAVES.md`. Em resumo:

- Supabase: URL, project id, anon key e service_role key
  (Project Settings → API no supabase.com).
- IA: `AI_API_KEY` do Google (aistudio.google.com).
- Jina: `JINA_API_KEY` (opcional).

## Lembrete

Este `.env` serve para correres a app no teu PC (`npm run dev`). Para a app
online, os mesmos valores vão no painel do Netlify
(Site settings → Environment variables), não neste ficheiro.
