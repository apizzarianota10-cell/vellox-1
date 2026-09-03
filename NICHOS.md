# Este projeto vai ser duplicado e nichado — leia isto primeiro

Este repositório (Vellox) é a base **genérica** de um SaaS de gestão de pedidos/entregas
para restaurantes. O plano do dono do produto é duplicar esta pasta inteira 3 vezes e
transformar cada cópia num produto **focado num nicho específico**:

1. **Hamburgueria**
2. **Pizzaria**
3. **Sushi / culinária japonesa**

Se você (Claude) foi aberto numa cópia deste projeto e o usuário pediu algo como
"modela esse projeto pro nicho de [X]", **este arquivo é o seu ponto de partida.**
O projeto-mãe (este) permanece genérico — não mexa na identidade dele a menos que
seja explicitamente esse o pedido.

## Regra número 1: pergunte antes de assumir

Antes de sair alterando cor, nome ou copy, confirme com o usuário (ex.: via pergunta
direta) o que ainda não está decidido:

- **Qual nicho** é esta cópia (se não estiver óbvio pelo nome da pasta/repo).
- **Nome da marca** desse produto nichado — continua "Vellox" com sufixo (ex.: "Vellox
  Pizza") ou é um nome totalmente novo? Isso muda o escopo de quanto texto precisa ser
  reescrito.
- **Infra separada ou compartilhada**: cada nicho vai ter seu próprio projeto Supabase +
  Vercel + domínio (produtos independentes), ou é multi-tenant no mesmo backend com um
  campo de "nicho" na empresa? Isso não existe hoje no schema (não há coluna
  `nicho`/`tipo_negocio` em `empresas`) — se for a rota multi-tenant, é trabalho de
  schema novo, não só de reskin.
- **Domínio/branding visual**: o usuário já tem uma paleta/logo em mente, ou é pra você
  sugerir?

Não assuma "reskin cosmético rápido" nem "produto 100% do zero" sem confirmar — são
esforços muito diferentes.

## O que É genérico e NÃO deveria mudar por nicho

O modelo de dados (produtos, adicionais, sabores vinculados, pedidos, motoboys,
impressão) já foi desenhado para ser flexível o bastante pra cobrir os 3 nichos sem
mudança de schema:

- `produtos` + `produto_adicionais` → cobre extras/adicionais de qualquer nicho
  (bacon extra no hambúrguer, borda recheada na pizza, cream cheese no sushi).
- `sabores_vinculo_ids` (ver `src/types/index.ts`) → já implementa "sabor vinculado a
  outro produto", usado hoje pra meio-a-meio de pizza, mas serve pra qualquer combo
  onde um item herda opções de outro.
- Fluxo de pedido, motoboys, impressão térmica (`src/lib/printService.ts`,
  `public/print-server/servidor.ps1`), rastreamento (`/pedido/[token]`) → agnósticos de
  nicho, não tocar.

**Conclusão prática: nichar aqui é, na maioria, um trabalho de apresentação (visual +
copy + terminologia), não de reescrever o backend.** Resista à tentação de propor uma
refatoração de schema antes de confirmar que ela é realmente necessária.

## Onde fica a identidade visual (o que muda por nicho)

A cor de marca é um valor literal repetido pelo código (não é 100% centralizada), então
trocar paleta é uma operação de *find & replace em massa*, não uma edição de um único
arquivo. Padrão usado da última vez que a paleta mudou (laranja → vermelho/amarelo, ver
histórico do git):

- `src/app/globals.css` — as CSS custom properties oficiais (`--primary`,
  `--primary-hover`, `--primary-glow`, `--primary-tint`, `--primary-ring`), definidas 3x
  (`:root`, `[data-theme="dark"]`, `[data-theme="light"]`) + o `@keyframes
  glow-pulse-orange`/`glow-pulse-red`.
- Hex literais espalhados por `src/**/*.tsx` — NÃO existe token único, é hex direto
  (`#E4002B`, `#FFC72C`, `#A80021`, `#5C0015` são os valores atuais). Para trocar em
  massa:
  ```
  grep -rli "#<hex-antigo>" src | xargs sed -i 's/#<hex-antigo>/#<hex-novo>/gI'
  ```
  Repita para cada tom da paleta e para as formas `rgba(r,g,b,` equivalentes (o mesmo
  código usa `rgba(...)` em paralelo ao hex em muitos lugares — não esqueça delas).
  **Depois do sed, rode `grep -rliE` pra confirmar zero sobras**, e revise manualmente
  variáveis semânticas como `--primary-hover` (deve continuar "parecendo" a cor
  primária, não virar um hue completamente diferente por acidente do sed).
- **NÃO toque** em `configuracao_loja.cor_principal` nem no que lê esse campo — é a cor
  que cada restaurante-cliente escolhe pra própria loja (dado do usuário final,
  independente da marca da plataforma). Confundir os dois já causou retrabalho antes.

## Onde fica o nome "Vellox" (texto visível vs identificador interno)

Rodar `grep -rli vellox src public` retorna ~35 arquivos. **Não renomeie tudo às
cegas** — são duas categorias bem diferentes:

1. **Texto visível pro usuário** (troque pelo nome novo da marca):
   - `src/app/layout.tsx` — metadata (`title`, `openGraph`, `appleWebApp`).
   - `public/manifest.json` — `name`/`short_name`/`description` do PWA.
   - `src/components/SplashScreen.tsx` — tela de carregamento.
   - `src/app/LandingPage.tsx` — **esta é a landing page institucional do SaaS**, a que
     vende o produto pra dono de restaurante decidir assinar. É o principal candidato a
     reescrita completa por nicho (ver seção abaixo).
   - Telas de login/registro, footer, páginas de erro, `/assinatura` — qualquer texto
     "Powered by Vellox" ou títulos de página.
2. **Identificador interno, NÃO renomeie sem necessidade real** (renomear quebra dados
   já persistidos de clientes reais em produção, ou contratos implícitos de protocolo):
   - Chaves de `localStorage` (ex. prefixos tipo `vellox_theme`, tokens do agente de
     impressão).
   - `New-Object System.Threading.Mutex($false, "VelloxPrintServer_$empresaId")` em
     `public/print-server/servidor.ps1` — nome de escopo do mutex, não precisa
     acompanhar o rebrand.
   - Nomes de tabela/coluna no Supabase, nomes de função RPC.

Se a decisão for renomear a marca de verdade (não só a cor), classifique cada ocorrência
antes de tocar — pergunte ao usuário se não tiver certeza se algo é visível ou interno.

## A landing page institucional (`src/app/LandingPage.tsx`)

Hoje ela vende "Vellox" genérico pra qualquer dono de restaurante. Nichar significa
reescrever copy, imagens/ícones de exemplo e prova social pra falar diretamente com o
público daquele nicho — ex.:

- **Hamburgueria**: linguagem de "monte seu lanche", ritmo rápido, delivery de bairro.
- **Pizzaria**: meio-a-meio, tempo de forno, pedido em grupo/família — a paleta
  vermelho/amarelo atual já é coerente aqui (bandeira italiana informalmente associa
  vermelho+branco+verde, vale considerar).
- **Sushi**: tom mais premium/minimalista — paletas com amarelo saturado tendem a
  remeter a fast-food, o que pode destoar de um posicionamento sushi mais sofisticado;
  vale considerar preto/vermelho/branco sem o amarelo, ou confirmar com o usuário antes
  de aplicar a paleta padrão sem pensar.

Isso é o storefront institucional (venda do SaaS), diferente do storefront do
restaurante-cliente (`src/app/loja/[slug]/LojaClient.tsx`), que é genérico por design
(cada restaurante já customiza nome/cor/cardápio próprios ali).

## O painel/dashboard (`(dashboard)/*`)

"Cada painel focado no seu nicho" na prática dá pra atacar em duas camadas, do mais
barato pro mais caro:

1. **Terminologia e emphasis (barato, sem mudança de schema)**: rótulos, textos de
   ajuda, ordem de destaque de features. Ex.: pizzaria já tem UI de "sabores"
   vinculados (`ImpressaoClient.tsx`, `CatalogoClient.tsx`, `LojaClient.tsx`) — pra
   pizzaria isso pode virar destaque principal; pra hamburgueria, os mesmos campos
   podem ser re-rotulados como "adicionais"/"monte seu lanche"; pra sushi, como "peças
   do combinado".
2. **Toggle de features (médio)**: esconder/mostrar seções que não fazem sentido pro
   nicho (ex. calculadora de meio-a-meio pode ficar escondida por padrão fora de
   pizzaria).

Não invente uma camada de configuração de "nicho" no banco pra isso — como cada nicho
já é um projeto separado (pasta duplicada), o ajuste é hardcoded na cópia daquele nicho,
sem necessidade de runtime switch.

## Gotchas técnicos herdados (valem para as cópias, mesma estrutura de pasta)

- `npm run build` costuma travar com `Error: UNKNOWN: unknown error, read` (errno
  -4094) durante a fase de TypeScript do Next — é interferência do OneDrive sincronizando
  a pasta, não é bug de código. Validação confiável, use sempre em background:
  ```
  npx tsc --noEmit -p tsconfig.json > log 2>&1; echo "EXITCODE:$?" >> log
  ```
  Nunca faça `comando | tail`, isso mascara o exit code real (relatar sucesso mesmo
  quando o comando falhou).
- Se for validar sintaxe de PowerShell (`servidor.ps1`) programaticamente, use
  `[System.IO.File]::ReadAllText(path, [System.Text.Encoding]::UTF8)` +
  `Parser::ParseInput` — `ParseFile()` puro dá falso positivo em arquivos com acentos.
- `AGENTS.md` (importado no `CLAUDE.md`) avisa que esta versão do Next.js tem breaking
  changes vs. o conhecimento de treino — ler `node_modules/next/dist/docs/` antes de
  mexer em rotas/APIs novas continua valendo em qualquer cópia.

## Resumo do fluxo recomendado quando o usuário pedir para nichar

1. Confirme o que está em aberto (seção "Regra número 1").
2. Rode `grep -rli "#<hex-antigo>"` / `grep -rli vellox` pra levantar o estado atual
   real do código dessa cópia — não confie cegamente nas listas acima, elas podem ter
   ficado desatualizadas desde que este arquivo foi escrito.
3. Aplique paleta nova (`globals.css` + sed em massa + revisão manual de tokens
   semânticos).
4. Reescreva `LandingPage.tsx` pro público do nicho.
5. Ajuste terminologia/copy do painel onde fizer sentido pro nicho.
6. Valide com `tsc --noEmit` (nunca confie só em `npm run build` neste ambiente).
7. Só faça commit/push depois de confirmação do usuário — ele trabalha com
  restaurantes reais em produção e prefere revisar antes do deploy ir ao ar.
