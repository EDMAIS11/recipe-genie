# Importar o .env para o Netlify

Sim — o Netlify deixa carregar um `.env` de uma vez, em vez de adicionares cada
variável à mão.

## Como fazer

1. No painel do Netlify: o teu site → **Site settings → Environment variables**.
2. **Add a variable** → escolhe **Import from a .env file**.
3. Faz upload do teu `.env` **ou** cola o conteúdo do ficheiro na caixa.
4. O Netlify cria todas as variáveis de uma só vez.

(Em alternativa, com o Netlify CLI: `netlify env:import .env` a partir da pasta
do projeto.)

## Cuidados antes de importar

**Valores de produção, não de desenvolvimento.** O `.env` local pode ter valores
virados para o teu PC (ex.: URLs com `localhost`). Antes de importar, confirma
que os valores são os de produção — sobretudo os que dependem do URL do site.
Se usas o mesmo Supabase em dev e produção, a maioria é igual; muda só o que
aponta para o site.

**Depois de importar, faz um novo deploy.** As variáveis não se aplicam ao build
que já está online. Vai a **Deploys → Trigger deploy → Deploy site** para o
Netlify reconstruir com as novas variáveis.

**Confirma que importaste tudo.** Verifica que ficaram lá as chaves todas:
Supabase (incluindo `SUPABASE_SERVICE_ROLE_KEY`), `AI_API_KEY`,
`AI_GATEWAY_URL`, `AI_MODEL` e `JINA_API_KEY`.

## Nota de segurança

Importar o `.env` para o Netlify é seguro — as variáveis ficam guardadas no
painel do Netlify, não no código nem no GitHub. O que nunca deves fazer é
commitar o `.env` para o repositório (continua protegido pelo `.gitignore`).

## Lembrete

Isto trata da app **online**. Para a app funcionar mesmo, o Supabase novo tem de
ter as tabelas criadas pelas migrações (ver `MIGRAR-SUPABASE.md`), e o repo tem
de estar ligado ao Netlify com **Base directory = `recipe_genie`**.
