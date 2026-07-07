# Publicar no GitHub — passo a passo

## 1. Estar na pasta certa

```bash
cd /home/eduardo-silva/Transferências/Recipe_Genie_clean
ls
```

Confirma que o `ls` mostra o `package.json`. Se mostrar antes outra pasta
`recipe_genie`, entra nela primeiro (`cd recipe_genie`) até veres o
`package.json`. É a partir dessa pasta que corres tudo o resto.

## 2. Criar o repositório no site

github.com → botão **+** (canto superior direito) → **New repository**:

- **Repository name:** `recipe-genie`
- **Visibility:** **Private**
- **Não** marques "Add a README", ".gitignore" nem "license".
- **Create repository**.

Guarda o URL que aparece: `https://github.com/<utilizador>/recipe-genie.git`.

## 3. Enviar o código (uma vez)

```bash
git init
git add .
git commit -m "Recipe Genie — versao sem Lovable"
git branch -M main
git remote add origin https://github.com/<utilizador>/recipe-genie.git
git push -u origin main
```

Substitui `<utilizador>` pelo teu nome de utilizador do GitHub.

Se ainda não configuraste a tua identidade no git, corre uma vez antes do
commit:

```bash
git config --global user.name "Eduardo Silva"
git config --global user.email "o-teu-email@exemplo.com"
```

## 4. Autenticação no primeiro push

O GitHub vai pedir para te autenticares. Duas formas simples:

- **GitHub CLI:** instala com `sudo apt install gh`, corre `gh auth login` e
  segue as perguntas. Depois o `git push` funciona sem pedir password.
- **Token:** github.com → Settings → Developer settings → Personal access tokens
  → Fine-grained tokens → Generate. Usa esse token como password quando o
  `git push` a pedir.

## 5. Confirmar

Abre `https://github.com/<utilizador>/recipe-genie` no browser — deves ver os
ficheiros. O `.env` **não** deve aparecer (está protegido pelo `.gitignore`);
confirma que não subiu.

## Envios seguintes

De cada vez que mudares algo:

```bash
git add .
git commit -m "descricao da alteracao"
git push
```

## A seguir

Com o código no GitHub, liga o Netlify a este repositório (ver `DEPLOY.md`).
