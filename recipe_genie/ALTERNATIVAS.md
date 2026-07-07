# Alternativas mais em conta

Opções mais baratas para cada serviço, separadas pelo esforço que dão.
**Aviso:** preços e tiers mudam — confirma sempre no site de cada serviço
(referência de início de 2026).

## Trocas fáceis (só mudar o `.env` ou uma config)

### IA — a poupança mais fácil
O provider de IA é compatível com OpenAI e configurável por variáveis, por isso
trocas sem tocar no código. Basta mudar três variáveis:

**Google Gemini (tem plano gratuito):**
```
AI_API_KEY="a-tua-key-do-google-ai-studio"
AI_GATEWAY_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
AI_MODEL="gemini-2.5-flash"
```

**Groq (tier gratuito, muito rápido):**
```
AI_API_KEY="a-tua-key-groq"
AI_GATEWAY_URL="https://api.groq.com/openai/v1"
AI_MODEL="llama-3.3-70b-versatile"
```

Obténs a key do Google em aistudio.google.com e a da Groq em console.groq.com.

### Alojamento — Cloudflare é o mais generoso no grátis
O Nitro suporta vários destinos. Para Cloudflare Pages, muda o preset no build
(em vez de `netlify`):
```
NITRO_PRESET="cloudflare-pages"
```
Outras opções com tier gratuito: Vercel (`vercel`), ou um servidor Node teu
(`node-server`) num VPS barato (ex.: Hetzner a poucos euros/mês).

## Trocas com trabalho (exigem mexer no código)

### Firecrawl — o serviço que atinge limites mais depressa
O código usa a biblioteca `@mendable/firecrawl-js` com `search` + `scrape`.
Alternativas mais baratas, mas que obrigam a reescrever essa parte:

- **Jina Reader** (r.jina.ai) — tier gratuito folgado; devolve markdown de uma
  página. Não faz "search", só "scrape" de um URL que já tenhas.
- **Auto-alojar o Firecrawl** — é open source; grátis, mas precisa de servidor.
- **Crawl4AI** — open source, auto-alojado, grátis.
- **fetch + Readability/Cheerio** — grátis, mas sites com muito JavaScript
  (ex.: Continente) podem não funcionar sem um browser headless.

### Supabase — melhor não trocar
O plano gratuito já é a opção barata. Trocar por outra base de dados obrigaria a
reescrever autenticação, RLS e migrações — não compensa. Se só te incomoda o
projeto adormecer sem uso, o salto para Pro resolve isso.

## Recomendação para gastar o mínimo

1. **IA:** muda já para a API do Google Gemini (grátis para volume baixo).
2. **Alojamento:** Cloudflare Pages ou fica no Netlify grátis.
3. **Base de dados:** fica no Supabase grátis.
4. **Scraping:** começa com os créditos grátis do Firecrawl; só migra para o
   Jina Reader (ou auto-alojado) quando o volume justificar o trabalho.

Assim ficas praticamente sem custos até teres uso a sério, e o único ponto que
eventualmente pagará algo é o scraping.
