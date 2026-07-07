# O que é o prefixo VITE_ nas variáveis

No `.env` vês variáveis com e sem o prefixo `VITE_`:

```
SUPABASE_URL="..."              # lado servidor
VITE_SUPABASE_URL="..."         # lado browser (mesmo valor)
```

## O que significa

O Vite (a ferramenta de build) só expõe ao código que corre no **browser** as
variáveis que começam por `VITE_`. As restantes ficam só no **servidor**. É uma
barreira de segurança: impede que segredos do servidor cheguem sem querer ao
browser.

## Porque há valores repetidos

Alguns valores são precisos nos dois lados. Por isso duplicam-se, com o mesmo
conteúdo:

| Servidor                     | Browser                          | Valor      |
|------------------------------|----------------------------------|------------|
| `SUPABASE_URL`               | `VITE_SUPABASE_URL`              | igual      |
| `SUPABASE_PROJECT_ID`        | `VITE_SUPABASE_PROJECT_ID`       | igual      |
| `SUPABASE_PUBLISHABLE_KEY`   | `VITE_SUPABASE_PUBLISHABLE_KEY`  | igual      |

O URL e a anon (publishable) key são públicos por natureza — a app usa-os no
browser para falar com o Supabase, protegida pelas regras de segurança (RLS).
Não há problema em expô-los.

## A regra crítica de segurança

A `SUPABASE_SERVICE_ROLE_KEY` **NÃO tem** `VITE_` — e nunca pode ter.

Essa chave dá acesso total à base de dados, ignorando as regras de segurança. Se
lhe puseres `VITE_` à frente, ela é enviada para o browser e fica visível a
qualquer pessoa que abra a app. É o erro de segurança mais grave a evitar.

O mesmo vale para a `AI_API_KEY` e a `JINA_API_KEY`: são chaves de servidor, sem
`VITE_`.

## Regra prática

- Preenche cada par (`X` e `VITE_X`) com o **mesmo** valor.
- Chaves secretas (service_role, IA, Jina) ficam **sem** `VITE_`.
- Na dúvida sobre se algo é secreto: se dá acesso privilegiado, nunca leva
  `VITE_`.
