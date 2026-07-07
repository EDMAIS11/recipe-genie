# O repositório não aparece no Netlify

O Netlify só mostra os repositórios a que o GitHub lhe deu acesso. Se o
`recipe-genie` não aparece, quase sempre é porque a app do Netlify no GitHub não
tem permissão sobre ele. Corrige-se do lado do GitHub.

## Solução principal — dar acesso ao repositório

1. No GitHub, canto superior direito → foto de perfil → **Settings**.
2. Menu lateral → **Applications**.
3. Separador **Installed GitHub Apps** → encontra **Netlify** → **Configure**.
4. Em **Repository access**, escolhe uma de duas:
   - **All repositories** (o Netlify passa a ver todos), ou
   - **Only select repositories** → botão **Select repositories** → adiciona
     `recipe-genie`.
5. **Save**.
6. Volta ao Netlify e atualiza a página de importação — o repositório deve
   aparecer.

## Se mesmo assim não aparecer

**Conta errada.** Confirma que entraste no Netlify com a **mesma conta GitHub**
(EDMAIS11) onde criaste o repositório. Se fizeste login no Netlify com email ou
Google diferentes, ele não vê os repos dessa conta do GitHub. Em
**Netlify → User settings → Connected accounts**, confirma que o GitHub ligado
é o EDMAIS11.

**Repositório privado.** Como o `recipe-genie` é privado, o acesso tem mesmo de
ser concedido no passo **Configure** acima — não basta a autorização inicial se
ela ficou limitada.

**Organização vs conta pessoal.** Se o repositório estiver dentro de uma
organização (e não na tua conta pessoal), o dono da organização pode ter de
aprovar a app do Netlify. Neste caso o repo está em EDMAIS11 (conta pessoal),
por isso não deve aplicar-se.

## Alternativa — ligar por URL / deploy manual

Se continuar a não aparecer e quiseres avançar, há dois caminhos:

- **Reautorizar do zero:** no Netlify, remove a ligação ao GitHub e volta a
  fazer **Add new site → Import from GitHub**, autorizando de novo e escolhendo
  o repositório logo aí.
- **Netlify CLI (sem passar pela lista):** instala com `npm i -g netlify-cli`,
  corre `netlify login` e depois, dentro da pasta `recipe_genie`, `netlify init`
  para ligar/criar o site.

## Lembrete de configuração (quando o repo aparecer)

- **Base directory:** `recipe_genie`
- **Build command:** `npm run build`
- **Publish directory:** `recipe_genie/dist/client`
- As variáveis de ambiente em **Site settings → Environment variables**.
