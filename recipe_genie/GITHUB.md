# Pôr o projeto no GitHub

Duas partes: criar o repositório vazio no site do GitHub e depois enviar o
código a partir da tua pasta.

## Parte 1 — Criar o repositório (no site)

1. Vai a github.com e entra (ou cria conta, é gratuita).
2. Canto superior direito: **+** → **New repository**.
3. Preenche:
   - **Repository name:** `recipe-genie`
   - **Visibility:** escolhe **Private** (recomendado — evita expor o código e
     configurações).
   - **NÃO** marques "Add a README", "Add .gitignore" nem "license". O projeto
     já traz esses ficheiros; se o GitHub criar os dele, dá conflito no primeiro
     envio.
4. **Create repository**.

Fica numa página com instruções e um URL do tipo
`https://github.com/<o-teu-utilizador>/recipe-genie.git`. Guarda esse URL.

## Parte 2 — Enviar o código (no terminal)

Precisas do Git instalado (`git --version` para confirmar; se não tiver,
instala em git-scm.com).

Dentro da pasta `recipe_genie` (a que descompactaste):

```bash
git init
git add .
git commit -m "Recipe Genie — versão sem Lovable"
git branch -M main
git remote add origin https://github.com/<o-teu-utilizador>/recipe-genie.git
git push -u origin main
```

Troca `<o-teu-utilizador>` pelo teu nome de utilizador do GitHub.

Na primeira vez, o GitHub pede autenticação. O mais simples é instalar o
[GitHub CLI](https://cli.github.com) e correr `gh auth login`, ou usar um
Personal Access Token como password (github.com → Settings → Developer settings
→ Personal access tokens).

## O que vai (e o que não vai) para o GitHub

O `.gitignore` já protege o que não deve subir:

- **NÃO sobem:** `.env` (as tuas chaves), `node_modules/`, `dist/`.
- **Sobem:** todo o código, as migrações do Supabase, os `.md` de documentação e
  o `netlify.toml`.

Confirma antes do commit, se quiseres, com `git status` — o `.env` não deve
aparecer na lista.

## Alternativa sem terminal — GitHub Desktop

Se preferires evitar a linha de comandos:

1. Instala o **GitHub Desktop** (desktop.github.com).
2. **File → Add local repository** → escolhe a pasta `recipe_genie`.
3. Ele deteta que ainda não é um repositório e oferece criá-lo — aceita.
4. Escreve uma mensagem e **Commit to main**.
5. **Publish repository** → mantém **Keep this code private** marcado → publica.

## A seguir

Com o código no GitHub, o próximo passo é ligar o Netlify a este repositório
(ver `DEPLOY.md`). A partir daí, cada `git push` faz deploy automático.
