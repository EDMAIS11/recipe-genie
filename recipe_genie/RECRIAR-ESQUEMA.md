# Recriar o esquema (migrações) — explicado

## O que é isto, em linguagem simples

"Migrações" são ficheiros `.sql` com as instruções para construir a base de
dados: criar as tabelas (receitas, preços, perfis…), as regras de segurança e as
funções. Estão em `supabase/migrations/` (18 ficheiros).

O Supabase que o Lovable tinha já corria estes ficheiros. O teu projeto novo está
**vazio** — não tem tabelas nenhumas. Correr as migrações é o que cria essa
estrutura toda no teu projeto. Sem este passo, a app liga-se ao Supabase mas dá
erro, porque não encontra as tabelas.

## Forma mais fácil (sem instalar nada)

Para não teres de correr 18 ficheiros um a um, juntei-os todos num só:
**`supabase/schema-completo.sql`**. Corres esse uma vez.

1. Entra no teu projeto em supabase.com.
2. No menu lateral, abre **SQL Editor**.
3. Clica em **New query**.
4. Abre o ficheiro `supabase/schema-completo.sql` (no teu PC), copia **tudo** e
   cola na caixa do SQL Editor.
5. Clica em **Run** (ou Ctrl+Enter).
6. Deve aparecer "Success". Se aparecer um erro, copia-o e mostra-me.

Para confirmar que resultou: no menu lateral, **Table Editor** → deves ver as
tabelas criadas (profiles, recipes, etc.).

## Alternativa (com o Supabase CLI)

Se preferires a linha de comandos, dá para aplicar as migrações originais uma a
uma automaticamente:

```bash
# instalar o CLI (uma vez)
npm install -g supabase

supabase login
supabase link --project-ref O_TEU_PROJECT_ID
supabase db push
```

O `db push` corre todos os ficheiros de `supabase/migrations/` por ordem. O
`O_TEU_PROJECT_ID` é o que está no URL do teu projeto Supabase.

## Nota sobre o job agendado (cron)

O `schema-completo.sql` já ativa as extensões necessárias (pg_cron, pg_net) e
está protegido para não falhar num projeto novo. A parte do cron tem dois
placeholders — `YOUR_APP_URL` e `YOUR_SUPABASE_ANON_KEY`. Podes:

- deixá-los como estão por agora (o agendamento fica criado mas aponta para um
  URL de exemplo — não faz mal para arrancar), e
- mais tarde, quando tiveres o URL do Netlify, editar essa parte com o URL e a
  anon key reais e correr só esse bocado outra vez.

## Depois disto

Com as tabelas criadas + o `.env` preenchido, a app já deve funcionar:

```bash
npm run dev
```

Cria uma conta e confirma no Supabase, em **Authentication → Users**, se o
utilizador aparece.
