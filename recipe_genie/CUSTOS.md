# Custos dos serviços

Resumo dos serviços de que a app depende e do respetivo custo.

**Aviso:** os preços mudam com frequência. Estes valores são uma referência de
início de 2026 — confirma sempre no site de cada serviço antes de decidir.

## Gratuitos para começar

| Serviço  | Para que serve            | Plano grátis                                                        | Quando começa a pagar                          |
|----------|---------------------------|---------------------------------------------------------------------|------------------------------------------------|
| GitHub   | Código + histórico        | Repositórios privados ilimitados                                    | Só para funcionalidades avançadas de equipa    |
| Netlify  | Alojamento + SSR          | Largura de banda e build generosos; funções serverless incluídas    | Com muito tráfego (Pro ~19 USD/utilizador/mês) |
| Supabase | Base de dados + login     | BD até 500MB, autenticação até dezenas de milhar de utilizadores    | Projeto adormece sem uso; Pro ~25 USD/mês      |

## Pagos por utilização

| Serviço            | Para que serve                | Modelo de custo                                        |
|--------------------|-------------------------------|--------------------------------------------------------|
| IA (OpenRouter)    | Extrair receitas, sugestões   | Por token. Gemini Flash é barato, mas não é grátis     |
| Firecrawl          | Scraping de receitas e preços | Poucos créditos grátis; planos pagos desde ~16–20 USD/mês |

## Na prática

- **Para testar e uso ligeiro:** consegues ter tudo a rodar sem pagar nada.
- **Primeiro custo real a aparecer:** Firecrawl (scraping), porque a app raspa
  sites de receitas e preços com frequência.
- **Segundo:** a IA, conforme o número de importações e sugestões.
- GitHub, Netlify e Supabase só passam a custar dinheiro com volume a sério.

## Como reduzir custos

- Guarda em cache o que já raspaste (evita repetir chamadas ao Firecrawl para a
  mesma receita/preço).
- Usa um modelo de IA mais barato em `AI_MODEL` quando não precisares de
  qualidade máxima.
- No Supabase, o plano grátis chega para desenvolvimento; só sobe para Pro
  quando quiseres que o projeto nunca adormeça.
