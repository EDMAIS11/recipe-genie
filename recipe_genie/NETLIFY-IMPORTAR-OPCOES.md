# Ecrã de importação de variáveis no Netlify — o que escolher

## Resumo rápido

| Campo             | Escolhe                | Porquê                                              |
|-------------------|------------------------|-----------------------------------------------------|
| Secret            | **Desmarcado**         | Evita falhar o build por causa das variáveis `VITE_`|
| Scopes            | **All scopes**         | Aplicam-se a builds, funções e runtime              |
| Deploy contexts   | **All deploy contexts**| Valem em produção e em pré-visualizações            |
| Merge strategy    | **Update conflicts***  | Faz os valores do teu `.env` mandarem               |

\* Vê a nota sobre os "3 skipped" antes de decidir.

## Secret — deixa DESMARCADO

Parece o mais seguro marcar, mas há uma armadilha: as variáveis `VITE_` têm de
entrar no código do browser, e o Netlify tem uma deteção de segredos que **falha
o build** se encontrar um valor marcado como "secret" nos ficheiros publicados.
Como estás a importar `VITE_` (públicas) e chaves secretas no mesmo lote, marcar
tudo como secret partiria o build.

Não faz mal deixar desmarcado: só as variáveis `VITE_` chegam ao browser, e
essas são públicas por natureza (URL e anon key). As secretas (service_role, IA,
Jina) não têm `VITE_`, por isso nunca vão para o browser de qualquer forma.

## Scopes — All scopes

O "Specific scopes" exige plano pago e não precisas dele. "All scopes" garante
que as variáveis estão disponíveis no build, nas funções e em runtime.

## Deploy contexts — All deploy contexts

Aplica os valores tanto ao site de produção como às pré-visualizações de deploy.

## Merge strategy — o que significa o "8 new / 3 skipped"

O teu `.env` tem 11 variáveis. O aviso diz que 8 são novas e 3 já existem no
Netlify.

- **Skip conflicts:** as 3 que já existem mantêm os valores antigos; os novos são
  ignorados.
- **Update conflicts:** as 3 passam a ter os valores do teu `.env`.

**Antes de decidir**, clica no link "3 environment variables will be skipped"
para veres quais são. Se os valores atuais estiverem errados ou a placeholder,
escolhe **Update conflicts** para o `.env` mandar. Se souberes que os 3 atuais
estão certos e não queres tocar-lhes, **Skip conflicts** serve.

Na dúvida, **Update conflicts** é o mais previsível: garante que tudo fica igual
ao teu `.env`.

## Aviso — o `.env` tem de estar preenchido

A importação copia o que está no ficheiro. Se ainda tiveres campos vazios (ex.:
`SUPABASE_SERVICE_ROLE_KEY=""`, `AI_API_KEY=""`), vais criar variáveis vazias.
Preenche o `.env` primeiro, ou corrige esses valores no Netlify depois.

## Depois de importar

Faz um novo deploy em **Deploys → Trigger deploy → Deploy site** para o Netlify
apanhar as variáveis.
