# Muntu COE — Portal P2P

Plataforma one-stop-shop P2P (Procure-to-Pay) do **Muntu Centre of Excellence**, para Angola, PALOP e África Subsaariana.

Aplicação full-stack em **Next.js 16** (App Router), com base de dados **Postgres (Supabase)** via **Drizzle ORM**.

## Estrutura

- `app/page.tsx` — frontend do portal (site institucional, login e workspace operacional).
- `app/api/**` — rotas de API (Next.js Route Handlers) que servem os dados ao frontend.
- `db/schema.ts` — modelo de dados (Drizzle, dialecto `postgresql`).
- `db/index.ts` — ligação à base de dados via `DATABASE_URL`.
- `db/seed-data.ts` — dados de demonstração (inseridos via `npm run db:seed`).
- `supabase/schema.sql` — SQL pronto a colar no SQL Editor do Supabase (tabelas, índices, RLS e dados de demonstração).

## Configurar a base de dados (Supabase)

1. Crie um projecto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e cole o conteúdo de `supabase/schema.sql`. Execute — cria as tabelas, os índices, activa RLS com políticas de demonstração e semeia os dados iniciais.
3. Em **Project Settings → Database → Connection string**, abra o separador **Transaction** (pooler/Supavisor, porta `6543`) e copie essa string — **não** a ligação directa (`db.<ref>.supabase.co`). A ligação directa só tem endereço IPv6 e o Render não tem saída IPv6, o que causa `ENETUNREACH` no arranque.
4. Copie `.env.example` para `.env.local` e cole a connection string em `DATABASE_URL`.

## Executar localmente

Requisitos: Node.js ≥ 20.

**Defina `SESSION_SECRET` em `.env.local` antes de arrancar** — sem isto, o login parece funcionar mas a sessão não sobrevive ao pedido seguinte (`npm run dev` usa Turbopack, que pode isolar cada rota de API no seu próprio módulo; o segredo aleatório de fallback deixa de ser garantidamente igual entre rotas — ver comentário em `lib/session.ts`). Gere um valor com `openssl rand -hex 32`.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

### Perfis de demonstração (login)

| Perfil | Nível de acesso | E-mail | Palavra-passe |
| --- | --- | --- | --- |
| Requisitante | `requester` | ana.manuel@operadora.ao | Muntu2026! |
| Administrador da empresa | `company_admin` | joao.sebastiao@operadora.ao | Muntu2026! |
| COE Manager | `coe_manager` | marta.miguel@muntucoe.ao | Muntu2026! |
| Analista (Buyer/AP) | `analyst` | sofia.neto@muntucoe.ao | Muntu2026! |
| System Admin | `system_admin` | rui.domingos@muntucoe.ao | Muntu2026! |
| Fornecedor | `supplier` | carlos.mateus@kwanzaindustrial.ao | Muntu2026! |

As palavras-passe são guardadas como hash bcrypt (`lib/password.ts`, `bcryptjs`) — nunca em texto simples. Se já tinha uma instalação anterior a esta alteração, volte a colar `supabase/schema.sql` no SQL Editor: a instrução de migração no fim do bloco de utilizadores reencripta em bcrypt qualquer palavra-passe ainda em texto simples (idempotente, não mexe em hashes já bcrypt).

## Personas e permissões

Seis níveis de acesso, aplicados tanto no menu (frontend) como nas rotas de API (`middleware.ts` + `lib/authz.ts` — a autorização real vive no servidor, o frontend só esconde o que o utilizador não pode usar).

Lado do cliente:

- **Requisitante** (`requester`) — limitado ao seu próprio workflow: consultar/criar os seus pedidos e escolher fornecedor no formulário. Sem acesso a aprovações, execução P2P, relatórios ou administração — essas rotas devolvem `403` no servidor mesmo que alguém tente chamá-las directamente.
- **Administrador da empresa** (`company_admin`) — visão abrangente da sua empresa: tudo o que um requisitante vê, mais aprovações, toda a execução P2P e relatórios. Pedidos, POs, facturas, recepções, excepções e lotes de pagamento são todos filtrados por `companyId` — um `company_admin` nunca vê dados de outra empresa.

Lado Muntu:

- **Analista — Buyer/AP** (`analyst`) — reporta ao COE Manager, restrito à **execução** do workflow (fornecedores, ordens de compra, recepções, facturas, excepções, pagamentos, repositório). Sem dashboard, sem relatórios, sem administração.
- **COE Manager** (`coe_manager`) — visão abrangente: dashboard, relatórios, aprovações, toda a execução P2P entre empresas clientes, e a avaliação/homologação de candidaturas (ver "Candidaturas e homologação").
- **System Admin** (`system_admin`) — responsável máximo da plataforma. Único nível com acesso a `/api/admin/**` e à página **Utilizadores**, onde concede/retira o nível de acesso de qualquer utilizador. Vê tudo o que o COE Manager vê.
- **Fornecedor** (`supplier`) — vê e edita só o seu próprio perfil (Supplier Passport) e só as suas próprias POs, recepções e facturas. Cada utilizador `supplier` está ligado a um `suppliers.id` concreto (`users.supplier_id`); sem essa ligação, o âmbito fica vazio — nunca "vê tudo" por omissão. O System Admin faz a ligação em **Utilizadores**. Passport, risco e estado continuam avaliados pela Muntu (não editáveis pelo próprio fornecedor); categoria e conteúdo local são auto-declaráveis via `PATCH /api/suppliers/:id`. `PATCH /api/receipts/:id` (confirmar recepção) também está limitado à recepção do próprio fornecedor.

### Gestão de permissões (System Admin)

A página **Utilizadores** (`/api/admin/users`) lista todos os utilizadores da plataforma, permite **criar** um utilizador novo (`POST /api/admin/users` — qualquer empresa/fornecedor/nível de acesso) e mudar o nível de acesso de qualquer um por um simples select (`PATCH /api/admin/users/:id`). Todas estas rotas só respondem a `system_admin`; qualquer outro nível recebe `403` do `middleware.ts` antes de chegar à rota.

### Convidar colegas para a própria empresa (Administrador da empresa)

Antes disto, o primeiro utilizador de uma empresa era criado pela homologação da candidatura (ver secção acima), mas não havia forma nenhuma — nem self-service, nem via admin — de juntar mais colegas à mesma empresa sem SQL directo. A página **Equipa**, visível só para `company_admin`, fecha esse buraco: lista os utilizadores da sua própria empresa e convida novos (`GET`/`POST /api/company/users`), sempre escopado a `session.companyId` — nunca a um id escolhido no pedido, por isso um `company_admin` não consegue convidar ninguém para outra empresa. Só pode atribuir `requester` ou `company_admin` (nunca `supplier`/`coe_manager`/`system_admin`). Tal como a homologação, cria o utilizador sem palavra-passe e envia o mesmo e-mail de "definir palavra-passe" (`lib/user-provisioning.ts#provisionUserWithoutPassword`, extraído da homologação para ser partilhado pelos três caminhos de criação de utilizador — homologação, `/api/admin/users` e `/api/company/users`).

### Contas dos donos da operação (COE Manager / System Admin)

As contas reais de quem gere a operação (não dados de demonstração) são criadas por um script dedicado, não pelo seed:

```bash
DATABASE_URL="<connection string real>" npx tsx scripts/create-owner-admins.ts
```

Cria `tocemedo@gmail.com` (`coe_manager`) e `zelyvaldog@gmail.com` (`system_admin`) — ou, se já existirem, só actualiza o papel/dados, **nunca** a password (correr o script outra vez nunca desfaz uma troca de password já feita). Numa criação nova, imprime uma password inicial aleatória uma única vez no terminal — guarde-a; a partir daí muda-se como qualquer conta, por "Recuperar acesso" no ecrã de login.

Estas duas contas entram pelo mesmo ecrã de login que qualquer cliente ou fornecedor — "Aceder ao portal". Não há ecrã reservado nem gesto secreto: como `muntucoe.ao` não é o domínio de nenhuma empresa registada, `POST /api/auth/company-lookup` cai directamente no fluxo de e-mail/palavra-passe (o mesmo que qualquer conta interna Muntu ou de fornecedor sem SSO usa), sem precisar de nenhum caminho especial. Havia antes um ecrã escuro dedicado, aberto por 4 cliques seguidos no símbolo do cabeçalho — foi removido por ser complexidade sem benefício real: o login normal já trata este caso correctamente.

## Facturação de actividade (cobrança ao cliente)

Modelo de preços do Estudo de Viabilidade §32.4/53.1: **retainer mensal + preço por PO (por tier) + preço por factura (por tier)**, com acesso básico gratuito e serviços avançados (onboarding, integração, analytics, formação) fora desta facturação recorrente.

- **Tiers de PO** (`automatico` | `standard` | `complexo`) — classificados a partir do "Tipo de transacção" do wizard (`lib/billing-tiers.ts`): "Compra urgente" → complexo, "PO catalogado" → automático, resto → standard. Aprovar um pedido gera agora automaticamente a PO ligada (`app/api/requests/[id]/route.ts`), já com o tier certo.
- **Tiers de factura** (`limpa` | `assistida` | `excecao`) — classificados a partir de `match`/`status`: excepção → excecao, "3-way match" → limpa, resto → assistida.
- **Preços por unidade** vivem em `billing_rates` (seeded com o ponto médio de cada intervalo do estudo). Editáveis na própria página **Facturação** (painel "Tarifas por unidade", `system_admin`) via `PATCH /api/admin/billing-rates/:key`, ou por SQL directo se preferir.
- **Retainer** vive em `companies.retainer_amount` (0 por omissão — o estudo não dá um valor indicativo, é "por cliente e escopo"). Editável na página **Facturação** (painel "Retainer por empresa") via `PATCH /api/admin/companies/:id`, ou por SQL directo: `update companies set retainer_amount = <valor AOA> where domain = '...'`.

Fluxo: `POST /api/admin/billing` (system_admin) gera uma `client_invoice` para uma empresa/período/âmbito (parcial ou total), somando retainer + POs + facturas desse período. Fica em `pendente_aprovacao`. O System Admin aprova ou rejeita (`PATCH /api/admin/billing/:id`); uma factura aprovada pode depois ser marcada como `enviada_contabilidade` — não há integração real com um sistema de contabilidade, é só um estado que sinaliza a entrega (a contabilidade não faz parte desta plataforma).

**Geração mensal automática:** `POST /api/admin/billing/generate-monthly` gera a factura do mês anterior para todas as empresas. Não corre sozinha — precisa de ser chamada por um agendador externo (Render Cron Job, GitHub Actions, cron-job.org, ...) com o header `x-cron-secret: <CRON_SECRET>`. Defina `CRON_SECRET` no Render; sem ele, a rota recusa sempre (nunca fica aberta por omissão).

## Login: SSO por empresa ou e-mail/password

O login pede primeiro o e-mail, consulta `/api/auth/company-lookup` para saber a que empresa pertence o domínio, e só depois decide o fluxo:

- **Sem empresa registada, ou empresa com `auth_method = 'password'`** → mostra o campo de palavra-passe (fluxo actual).
- **Empresa com `auth_method = 'sso'`** → mostra um botão que redirecciona para `/api/auth/sso/start`, que inicia um fluxo OIDC (authorization code + PKCE) genérico contra `sso_issuer_url`/`sso_client_id`/`sso_client_secret` guardados na tabela `companies`.

**Isto só produz um login funcional quando a empresa fornece credenciais reais** de um fornecedor de identidade compatível com OpenID Connect Discovery (Microsoft Entra ID, Google Workspace, Okta, ...). Para activar SSO para uma empresa:

1. Registe uma aplicação OIDC no IdP da empresa, com `redirect_uri` = `https://<o-seu-domínio>/api/auth/sso/callback`.
2. Preencha o método de login, issuer URL, client ID e client secret na página **Administração** (painel "SSO por empresa", só `system_admin`) — chama `PATCH /api/admin/companies/:id`. O client secret nunca é devolvido pela API depois de guardado (só um indicador "definido"/"não definido"); deixar o campo em branco ao editar mantém o valor actual. SQL directo continua a funcionar como alternativa:
   ```sql
   update public.companies
   set auth_method = 'sso',
       sso_issuer_url = 'https://login.microsoftonline.com/<tenant-id>/v2.0',
       sso_client_id = '<client-id>',
       sso_client_secret = '<client-secret>'
   where domain = 'exemplo.com';
   ```
3. O primeiro login por SSO cria automaticamente o utilizador (nível `requester` por omissão) e liga-o a essa empresa.

### Recuperar acesso

O botão "Recuperar acesso" (só aparece para contas de e-mail/password — contas SSO não têm password local para repor) chama `POST /api/auth/password-reset/request` com o e-mail. A resposta é sempre `{ ok: true }`, exista ou não uma conta com esse e-mail — nunca revela quais contas existem. Se existir e tiver password local, é gerado um token assinado (30 minutos, mesmo mecanismo HMAC das sessões, com `purpose: "password_reset"` para nunca ser confundido com um cookie de sessão) e enviado por e-mail via [Brevo](https://brevo.com) com o link `/?reset_token=<token>#login`. Abrir esse link mostra o formulário de nova password; submeter chama `POST /api/auth/password-reset/confirm`.

**Sem `BREVO_API_KEY`/`BREVO_FROM_EMAIL` definidas**, o pedido continua a funcionar exactamente da mesma forma (nunca falha, nunca revela nada) — só que o link fica registado nos logs do servidor (`console.warn`) em vez de ser enviado por e-mail, tal como o SSO só fica totalmente funcional com credenciais reais do IdP.

Para activar o envio real: crie uma conta em [brevo.com](https://brevo.com), gere uma API key (Settings → SMTP & API → API Keys) e defina `BREVO_API_KEY`. Depois, em Settings → Senders, adicione e verifique o e-mail que vai enviar (clica-se num link de confirmação enviado a esse endereço — sem precisar de configurar DNS nenhum) e defina-o em `BREVO_FROM_EMAIL="Muntu COE <no-reply@o-seu-dominio>"`.

Ao contrário do Resend (usado antes), o Brevo não tem um remetente de teste partilhado que funcione sem qualquer configuração — mas em troca, assim que o remetente está verificado, entrega a **qualquer** destinatário, não só ao e-mail da própria conta. É por isso que aqui as duas variáveis (`BREVO_API_KEY` e `BREVO_FROM_EMAIL`) são exigidas em conjunto: sem remetente verificado não há envio possível, por isso não faz sentido tentar com só a API key definida.

O token é de uso único (ver §Tokens de uso único abaixo) — uma segunda tentativa com o mesmo link já falha, mesmo dentro da janela de 30 minutos.

## Suporte (caixa de entrada de pedidos)

Qualquer utilizador autenticado (independentemente do `accessLevel`) pode abrir um pedido de suporte em **Suporte** na barra lateral — assunto, categoria e mensagem inicial; a prioridade por omissão é `normal`. Cada pedido recebe um ID `SUP-<ano>-####` (gerado aleatoriamente com nova tentativa em caso de colisão, mesmo padrão dos IDs de PO) e um prazo de SLA calculado a partir da prioridade (`lib/support.ts`):

| Prioridade | Janela de SLA |
| --- | --- |
| `urgente` | 4 horas |
| `alta` | 24 horas |
| `normal` | 72 horas |
| `baixa` | 120 horas |

Um utilizador normal só vê e responde aos seus próprios pedidos (403 para os de outra pessoa). O `system_admin` vê a caixa de entrada completa — com contagem de abertos e de pedidos com SLA vencido — pode responder a qualquer pedido (uma resposta do admin move automaticamente `aberto` → `em_curso`) e é o único que pode mudar estado, prioridade, categoria ou responsável. Fechar um pedido como `resolvido`/`fechado` regista `resolvedAt`; reabri-lo limpa esse campo. Tal como `users`/`billing_rates`/`document_files`, `support_tickets` e `support_messages` não têm política de `select` — ilegíveis pela API pública/anon key, só por rotas de servidor.

## SLA%, ciclo médio e outros números reais (sem dados mockados)

A versão inicial deste portal veio de um mockup estático: vários números no Dashboard, Relatórios, Login e site público (`96,4% SLA`, `3,2 dias`/`2,4 dias`/`1,8 dias` de ciclo — três valores diferentes para o mesmo conceito —, uma lista fixa de "excepções por causa", um gráfico de tendência com 5 de 6 meses inventados, 3 notificações sempre iguais para qualquer utilizador) ficaram por trás no código depois da app passar a ter dados reais nas restantes telas. Foram todos substituídos:

- **SLA no prazo % e ciclo médio de decisão** — única fonte real (`lib/requests-sla.ts`), calculada a partir de `requests.sla_due_at` (prazo calculado da prioridade na criação: Alta 4h, Média 8h, Normal 16h) e `requests.decided_at` (preenchido quando o pedido é aprovado/rejeitado). O mesmo par de números aparece agora, sempre igual, no Dashboard, em Relatórios e no site público/login (via `/api/public-stats`, sem sessão).
- **Tendência mensal em Relatórios** — agrupamento real de `requests` por mês de criação (`bucketRequestsByMonth`), em vez do array de 6 meses fixo no código.
- **Excepções por causa** — `exceptions.cause` (nova coluna) agregada de verdade; a caixa "Insight Muntu" descreve a causa mais comum real, em vez de uma frase fixa.
- **Spend local %** em Relatórios — conteúdo local de cada fornecedor (`suppliers.local`) ponderado pelo valor real das POs emitidas.
- **Notificações** (sino no topo) — derivadas do que já está carregado (excepções abertas mais antigas, pedidos à espera de aprovação, recepções prontas), não uma lista fixa.
- **Aprovador e fornecedor no wizard de novo pedido** — `/api/approvers` devolve `company_admin` da própria empresa + `coe_manager`/`system_admin`, em vez de 3 nomes fixos no código; o fornecedor por omissão é o primeiro fornecedor real, não sempre "Kwanza Industrial".
- **Anexos no wizard e upload de factura** — chamam o upload real (`/api/documents`) já usado no Repositório, em vez de um toast "de demonstração" que não gravava nada.
- **Idade das excepções** — calculada a cada render a partir de `exceptions.created_at` (`formatElapsedPt`), em vez de um texto tipo "2h 14m" gravado uma vez e nunca mais actualizado.

## Documentos ligados a uma entidade (Supplier Passport, linha temporal da PO, evidência)

Os botões "Ver" que antes só abriam um `toast.info()` — Supplier Passport, linha temporal da PO, imagem/match de factura, evidência de excepção e de recepção — agora abrem um `Sheet` real. O mais grave dos dois problemas que isto resolve nem era um botão morto: o dossier de um pedido (`RequestDetail`) mostrava sempre os mesmos dois nomes de ficheiro fixos no código (`Requisição e justificativo.pdf`, `Proposta do fornecedor.pdf`), iguais para qualquer pedido, sem nenhum handler a reagir ao clique.

`documents` ganhou `entity_type`/`entity_id` (substitui o antigo padrão de só ter `request` como texto livre, que nunca ligava a nada fora dos pedidos). `GET /api/documents?entityType=&entityId=` e o `POST` equivalente servem os cinco ecrãs através de um único componente partilhado (`EntityDocuments`) e uma única função de autorização (`lib/document-access.ts#canAccessDocumentEntity`), que replica as mesmas regras de dono/mesma-empresa/mesmo-fornecedor já aplicadas nas rotas de cada entidade — um `requester` só vê os documentos do seu próprio pedido, um `supplier` só os do seu próprio fornecedor/facturas/recepções, `company_admin`/`analyst` só os da sua âmbito, `coe_manager`/`system_admin` sempre.

Isto obrigou a abrir `/api/documents` a qualquer sessão válida no `middleware.ts` (deixou de estar restrito a `company_admin`/`analyst`/`coe_manager`/`system_admin`) — a autorização real passou a ser por linha, feita no próprio handler, o mesmo padrão já usado por `/api/requests`/`/api/suppliers`. Isto também corrigiu um bug real descoberto ao construir isto: o anexo do wizard de novo pedido (`NewRequest`, adicionado numa ronda anterior) nunca tinha sido testado como `requester` — só como `system_admin` — e teria falhado com `403` para a persona que mais usa esse fluxo, porque `/api/documents` excluía `requester` por completo.

A linha temporal da PO usada aqui é a real, com escrita própria — ver secção seguinte, "Linha temporal real da PO".

## Linha temporal real da PO

Até aqui, `PurchaseOrderTimelineSheet` mostrava uma linha temporal *derivada*: juntava o `createdAt`/`decidedAt` do pedido de origem (quando existia `requestId`) com o estado actual da PO — sem tabela própria, porque nenhuma rota tinha um caminho de escrita para as transições de estado da PO. Isso já não é verdade: `po_events` (tabela nova) regista um evento real por cada coisa que realmente aconteceu a uma PO, escrito no mesmo momento em que acontece — nunca recalculado a partir de outras tabelas.

Pontos de escrita (`lib/po-events.ts#recordPoEvent`):

- **`criada`** — quando a PO é gerada, tanto a aprovar um pedido (`PATCH /api/requests/:id`) como a adjudicar um tender (`POST /api/tenders/:id/award`); a descrição regista se houve override de risco alto.
- **`confirmada`** — quando uma recepção é confirmada (`PATCH /api/receipts/:id`) e o campo `receipts.po` (texto livre, sem FK) corresponde mesmo a uma PO real; sem correspondência, não é escrito nenhum evento órfão.
- **`expediting` / `entregue` / `excepcao` / `excepcao_resolvida`** — pelas transições de estado explícitas em `PATCH /api/purchase-orders/:id` (`ship` / `deliver` / `flag_exception` / `resolve_exception`), cada uma validando que o estado actual da PO faz sentido para a acção pedida (ex.: não é possível `deliver` uma PO que ainda não está `Expediting`). Restrito a `company_admin`/`analyst`/`coe_manager`/`system_admin` — um fornecedor vê a sua PO mas não avança o estado.

`GET /api/purchase-orders/:id` devolve a PO e os seus eventos (ordenados do mais antigo para o mais recente); é o que `PurchaseOrderTimelineSheet` agora consome, mostrando também os botões de transição disponíveis para quem tem permissão.

## Candidaturas e homologação (o primeiro contacto real com a plataforma)

Antes disto, não havia nenhuma forma de uma empresa ou fornecedor novo chegar à plataforma: não existia auto-registo, nem rota para criar empresa/utilizador (só `GET`/`PATCH` em `/api/admin/*`), e "Convidar fornecedor" (`Suppliers`) só criava uma linha em `suppliers`, sem utilizador nem login nenhum. Quem quisesse aceder tinha de ser criado à mão por SQL directo.

`applications` (tabela nova) modela o fluxo Candidatura → Documentos → Avaliação → Aprovada/Rejeitada → Homologação → Acesso Muntu:

1. **Candidatura** — formulário público em `#candidatura` (`CandidaturaScreen`, sem sessão nenhuma), `POST /api/applications`. Devolve um token assinado (HMAC, 30 dias, `purpose: "application_access"` — mesmo mecanismo dos tokens de recuperação de acesso) e envia um e-mail de confirmação com o link de acompanhamento (`sendApplicationReceivedEmail`, mesmo comportamento de "regista no log em vez de falhar" sem `BREVO_API_KEY`/`BREVO_FROM_EMAIL`).
2. **Documentos** — o candidato, ainda sem conta nenhuma, anexa (`POST /api/applications/:id/documents`) e **descarrega** (`GET /api/applications/:id/documents/:documentId/download`) os seus próprios documentos a partir do link recebido — as duas rotas autorizadas só pelo token, nunca por sessão, e a de download verifica também que o documento pertence mesmo a esta candidatura, não só que o token é válido. A equipa Muntu vê os mesmos documentos pela rota geral (`GET /api/documents?entityType=application&entityId=...`), coberta pelo desvio de `coe_manager`/`system_admin` já existente em `lib/document-access.ts`.
3. **Avaliação / Aprovada / Rejeitada** — só `coe_manager`/`system_admin`, no ecrã **Candidaturas** do portal (`PATCH /api/applications/:id`). Rejeitar exige motivo. O mesmo `PATCH` também atribui um responsável (`assignedToUserId`, só a outro `coe_manager`/`system_admin` — mesmo padrão de `support_tickets.assigned_to_user_id`), independente da mudança de estado.
4. **Homologação → Acesso Muntu** — `POST /api/applications/:id/homologate`, só a partir do estado `aprovada`. Cria de facto a `companies`/`suppliers` e o primeiro utilizador (`company_admin` ou `supplier`, sem palavra-passe ainda) e envia um e-mail de boas-vindas reaproveitando o mesmo token/rota de "definir palavra-passe" da recuperação de acesso (`sendWelcomeSetPasswordEmail` + `POST /api/auth/password-reset/confirm`). Recusa homologar duas vezes ou um e-mail já usado por outra conta.

`middleware.ts` ganhou `OPTIONAL_AUTH_PREFIXES` para este caso: `/api/applications*` nunca devolve `401` por falta de sessão (o candidato não tem nenhuma), mas continua a preencher os headers `x-muntu-*` quando existe uma sessão real, para a Muntu poder rever/homologar — `lib/authz.ts#getOptionalSession` é quem distingue os dois casos dentro de cada rota.

### Tokens de uso único (recuperação de acesso e boas-vindas)

Os tokens de "definir palavra-passe" (recuperação de acesso e boas-vindas da homologação/criação de utilizador) passam a ter um `jti` aleatório (`lib/session.ts#generateJti`) marcado como consumido em `consumed_tokens` (`lib/consumed-tokens.ts#consumeTokenOnce`) na primeira confirmação bem-sucedida — uma segunda tentativa com o mesmo link já falha. A chave primária em `jti` é a própria garantia atómica: não há SELECT antes do INSERT, só o INSERT a falhar ou não sob concorrência. Um token assinado antes desta alteração (sem `jti`) continua a funcionar como antes (reutilizável dentro da janela) — não invalida nada já emitido.

Deliberadamente **não** aplicado ao token de acesso à candidatura (`application_access`): esse precisa de continuar a servir vários pedidos (consultar estado, anexar mais do que um documento) ao longo da janela de 30 dias — torná-lo de uso único quebraria o fluxo, não é o mesmo tipo de token que os de "definir password uma vez".

Ao escrever o teste deste comportamento, uma colisão real forçada expôs um bug latente na verificação `error.code === "23505"` já usada nesses sítios: o driver por vezes embrulha o erro real do Postgres num wrapper com `.cause`, e nesses casos `error.code` fica `undefined` — a "nova tentativa em caso de colisão" nunca disparava de verdade, só se via a colisão a ser relançada. Extraído para `lib/db-errors.ts#isUniqueViolation` (verifica os dois sítios) e aplicado a todos os geradores de id com nova tentativa do projecto: `requests`, `support_tickets`, `applications`, `purchase_orders` (incluindo a PO gerada pela adjudicação de um tender), `client_invoices` e `consumed_tokens`. `tests/integration/id-collision-retry.test.ts` e `tests/integration/billing.test.ts` forçam a mesma colisão real contra `/api/requests` e `/api/admin/billing` para garantir que a correcção fica coberta.

**Limitação conhecida (fica para depois):** Supplier Development (o terceiro dos três pilares operacionais da Muntu COE) continua sem mudanças.

## Sourcing — Tenders / RFQ (primeira etapa concorrencial do Procurement)

Até aqui, uma PO só nascia de um pedido já aprovado (`PATCH /api/requests/:id` com `action: "approve"`) — não havia nenhum processo de pedir cotações a vários fornecedores em concorrência antes de emitir a PO. `tenders`/`tender_invites`/`bids` (tabelas novas) modelam esse processo: **Aberto → Propostas → Adjudicado**.

1. **Abrir um tender** — `POST /api/tenders` (ecrã **Tenders (RFQ)**, `company_admin`/`analyst`/`coe_manager`/`system_admin`). Cria o tender e já convida os fornecedores indicados na mesma transacção — um tender sem nenhum convite não tem utilidade nenhuma. O `companyId` nunca vem do corpo para um `company_admin` (sempre `session.companyId`, mesma regra de `companyUserInviteSchema`/`tenderCreateSchema`); os outros papéis têm de o indicar. No ecrã, a criação está limitada por agora a `company_admin` (empresa da sessão) e `system_admin` (escolhe a empresa de uma lista) — os únicos dois papéis com uma fonte clara de `companyId` no interface; `analyst`/`coe_manager` já conseguem gerir e adjudicar tenders existentes pela API, mas ainda sem um selector de empresa no ecrã para abrir um novo.
2. **Propor** — `POST /api/tenders/:id/bids`, só `supplier`, só se convidado (`tender_invites`), só enquanto `status = "aberto"` e o prazo não passou. Um fornecedor só pode ter uma proposta por tender (índice único `tenders_id+supplier_id`) — reenviar substitui o valor/notas da proposta anterior (`ON CONFLICT DO UPDATE`) em vez de criar uma segunda linha.
3. **Ver o detalhe** — `GET /api/tenders/:id` devolve formas diferentes consoante quem pergunta: o comprador vê a lista de convidados e **todas** as propostas; um fornecedor vê só a sua própria (`myBid`) — nunca as dos concorrentes, mesmo sendo o mesmo tender.
4. **Adjudicar** — `POST /api/tenders/:id/award`, mesmos papéis de criação. Marca a proposta escolhida `vencedora`, todas as outras `rejeitada`, fecha o tender (`status: "adjudicado"`) e gera a PO — tudo numa única transacção, para nunca ficar um tender adjudicado sem PO nem uma PO órfã sem tender fechado. A PO nasce com `tier: "complexo"` fixo (`lib/billing.ts`): uma RFQ concorrencial já implica mais esforço da Muntu do que uma PO standard assistida, e não há "Tipo de transacção" nenhum (como há num pedido normal) para classificar de outra forma.

`middleware.ts` ganhou `{ prefix: "/api/tenders", allow: [...] }` incluindo `supplier` — o âmbito real (só os tenders para que foi convidado, nunca a lista completa de sourcing de outra empresa) é feito no próprio handler, não pelo prefixo.

## Contratos (acordos com validade, distintos de uma PO pontual)

Antes disto, um fornecimento continuado (manutenção anual, call-off) não tinha nenhuma forma de ser registado como tal — só existiam POs pontuais, sem noção de vigência nem tecto de valor. `contracts` (tabela nova) fecha essa lacuna, ligada ao mesmo fornecedor/empresa das restantes entidades:

- **Registar** — `POST /api/contracts` (ecrã **Contratos**, `company_admin`/`analyst`/`coe_manager`/`system_admin`), com fornecedor, valor, data de início e fim (a de fim tem sempre de ser posterior à de início). Mesma limitação de âmbito de criação que Tenders: `company_admin` (empresa da sessão) e `system_admin` (escolhe a empresa) têm uma fonte clara de `companyId` no ecrã; `analyst`/`coe_manager` já conseguem gerir/terminar contratos existentes pela API, sem selector de empresa no ecrã ainda para registar um novo.
- **Estado** — só `activo`/`terminado` são gravados (`PATCH /api/contracts/:id` com `action: "terminate"`, terminação antecipada por uma pessoa). "A expirar" (menos de 30 dias) e "Expirado" **nunca** são gravados — são sempre calculados a partir de `end_date` no frontend (`contractDisplay`, mesmo princípio já usado na linha temporal da PO: derivado, não fabricado, para nunca ficar desactualizado).
- **Documentos** — o contrato em si (PDF assinado, aditamentos) anexa-se pelo mecanismo geral de documentos por entidade (`entityType: "contract"`, `lib/document-access.ts`), com o mesmo âmbito de dono/mesma-empresa/mesmo-fornecedor das outras entidades.
- **Âmbito de leitura** — um `supplier` só vê os seus próprios contratos, um `company_admin` só os da sua empresa (`GET /api/contracts`) — mesmo padrão de `/api/purchase-orders`.

## Alertas de SLA + escalonamento

Até aqui, "SLA vencido" só era mostrado a quem já estivesse a olhar para o pedido/ticket certo (a barra de notificações, o texto "SLA vencido" na tabela) — ninguém era avisado activamente, e nada distinguia um SLA vencido há 5 minutos de um vencido há 5 dias sem ninguém decidir. `POST /api/admin/sla-alerts/run` fecha essa lacuna, no mesmo padrão de `generate-monthly` acima: **não corre sozinha**, precisa de ser chamada periodicamente por um agendador externo com o header `x-cron-secret: <CRON_SECRET>`.

Em cada corrida:

1. **Alerta** — um pedido por decidir (`decided_at` nulo) com o SLA vencido, ou um ticket de suporte aberto/em curso com o SLA vencido, que ainda não foi alertado (`sla_alerted_at` nulo), recebe um e-mail (`sendSlaAlertEmail`, `lib/mailer.ts`) para quem pode decidir: os `company_admin` da empresa do pedido (ou `system_admin`, se o pedido não tiver empresa/nenhum `company_admin`); o responsável atribuído do ticket, ou todo o `system_admin` se ainda não estiver atribuído a ninguém. `sla_alerted_at` fica gravado nesse momento — é o que impede o mesmo alerta de ser reenviado em cada corrida seguinte.
2. **Escalonamento** — se o item continuar por decidir/resolver `REQUEST_SLA_ESCALATION_DELAY_HOURS`/`SUPPORT_SLA_ESCALATION_DELAY_HOURS` (24h, `lib/requests-sla.ts`/`lib/support.ts`) depois do alerta, é escalonado uma única vez (`sla_escalated_at`) para a liderança Muntu (`coe_manager`/`system_admin` no caso de um pedido; todo o `system_admin` no caso de um ticket, já que é o próprio topo da caixa de suporte).

`sla_alerted_at`/`sla_escalated_at` (colunas novas em `requests`/`support_tickets`) existem só para este controlo de "já enviado" — nunca são lidos como estado de negócio fora desta rota, mesma disciplina de `consumed_tokens` para tokens de uso único.

## Bloqueio por risco alto + libertação automática de pagamento

Duas automações ligadas pelo mesmo sinal real: `suppliers.risk`.

**Bloqueio por risco alto** (`lib/risk-block.ts`) — os dois únicos pontos reais onde uma PO nasce (aprovar um pedido, `PATCH /api/requests/:id`; adjudicar um tender, `POST /api/tenders/:id/award`) passam a verificar o risco do fornecedor antes de gerar a PO. Um fornecedor `risk = "Alto"` bloqueia por omissão (`409`, corpo `{ riskBlock: true, canOverride }`) — `company_admin` nunca consegue avançar, mesmo tentando `overrideRisk`; só `coe_manager`/`system_admin` conseguem, mandando `overrideRisk: true` explicitamente (o ecrã oferece isto como uma confirmação — "Fornecedor de risco alto — aprovar/adjudicar mesmo assim?" — só a quem tem a opção). A PO resultante grava `risk_overridden_by_user_id`/`risk_overridden_at` quando isto acontece — nulo é sempre o caso normal.

**Libertação automática de pagamento** — `POST /api/admin/payment-release/run`, mesmo padrão de agendador externo com `CRON_SECRET` das duas automações acima. Um lote de pagamento (`payment_batches`) ainda por libertar só é libertado sozinho (`released: true`, `auto_released_at`) quando a empresa dele não tem nenhum sinal real de problema por resolver: zero excepções abertas (`exceptions.resolved = false`) e nenhuma PO gerada para um fornecedor de risco alto sem override registado. Havendo qualquer um dos dois, o lote fica como estava — só a libertação manual (`PATCH /api/payments/:id`) continua disponível, porque decidir libertar apesar do problema é sempre uma decisão humana.

## Exportação bancária ISO 20022 (pain.001)

`GET /api/payments/:id/export/iso20022` gera um ficheiro `pain.001.001.03` (Customer Credit Transfer Initiation) real para um lote de pagamento — o formato que a maioria dos bancos angolanos/internacionais aceita para importar ordens de transferência em lote.

`payment_batches` nunca teve linhas próprias — é sempre um agregado (`count`/`value`), sem ligação nenhuma a facturas concretas. Em vez de inventar uma tabela de ligação nova só para isto, a exportação usa a interpretação real que este modelo já suporta: **as transacções do ficheiro são as facturas `status = "Validada"` (3-way match concluído) da mesma empresa do lote** — o mesmo sinal "pronto a pagar" que a libertação automática de pagamento já usa. Cada factura vira um `<CdtTrfTxInf>`; o `EndToEndId` é o id da própria factura, para o banco devolver uma referência que a Muntu consegue reconciliar de volta.

Pré-requisitos, verificados antes de gerar o ficheiro (nunca um XML incompleto ou com contas em branco):

- **Conta devedora da empresa** — `companies.iban`/`bic`, editável em **Administração → SSO e conta bancária por empresa** (`system_admin`). Sem isto definido, a exportação recusa com `400`.
- **Conta de cada fornecedor credor** — `suppliers.iban`/`bic`, editável no **Supplier Passport** de cada fornecedor (secção "Conta bancária", `company_admin`/`analyst`/`coe_manager`/`system_admin` — mesmos papéis que já editam `risk`/`passport`). Se alguma factura elegível tiver um fornecedor sem conta configurada, a exportação recusa com `400` e a lista dos ids das facturas em causa, em vez de gerar um ficheiro incompleto ou omitir silenciosamente um pagamento devido.
- **Pelo menos uma factura validada** — sem isso, `400`.

O ecrã **Pagamentos** ganhou um botão "ISO 20022" por lote, que descarrega o ficheiro directamente (mesmo padrão de descarga por blob já usado para documentos).

## Exportação fiscal AGT/SAF-T

`GET /api/admin/billing/export/saft?periodStart=&periodEnd=` gera um subconjunto real do SAF-T AGT (Ficheiro Normalizado de Auditoria Tributária, adaptação angolana do standard SAF-T) — `Header` + `MasterFiles/Customer` + `SourceDocuments/SalesInvoices` — cobrindo as facturas de cliente (`client_invoices`, já `aprovada`/`enviada_contabilidade`) que a Muntu emite às empresas que serve.

- **NIF de cada empresa cliente** — `companies.tax_id` (coluna nova), copiado automaticamente de `applications.tax_id` na homologação de uma candidatura "empresa"; empresas anteriores a essa cópia (dados semeados, ou criadas por outra via) ficam nulas até serem preenchidas na página **Facturação** (painel "Retainer e NIF por empresa", `system_admin`). Se alguma empresa facturada no período não tiver NIF, a exportação recusa com `400` e a lista dos ids das empresas em causa, em vez de gerar um ficheiro com um `CustomerTaxID` em branco.
- **NIF da própria Muntu** — variável de ambiente `MUNTU_NIF`, exigida (mesmo padrão de `CRON_SECRET`/`BREVO_API_KEY`: sem ela definida, a rota recusa sempre com `501`, nunca gera um ficheiro sem o identificador do próprio emitente).
- **IVA 14%** — `client_invoices.total_amount` não separa IVA de valor líquido (não modelado em mais nenhum sítio da app); a decomposição `NetTotal`/`TaxPayable` de cada `Invoice` aplica a mesma taxa de 14% já mostrada como regime fiscal fixo em **Administração** ("Angola • IVA 14%") — não é um valor novo inventado para isto.

**Limitação conhecida (fica para depois):** a cadeia de hash criptográfico exigida pela certificação oficial AGT (assinatura RSA encadeada entre facturas, elemento `Hash` de cada `Invoice`) não está implementada — precisaria de infra-estrutura de chaves que este projecto não tem. O elemento é omitido por completo (nunca um valor inventado que parecesse uma assinatura real); este ficheiro serve para conciliação/auditoria interna, não está pronto para submissão oficial à AGT sem essa camada.

## Exportação estruturada SAP (mapa de ordens de compra)

`GET /api/purchase-orders/export/sap?periodStart=&periodEnd=` gera um CSV das ordens de compra de uma empresa num período — para uma empresa cliente que corra SAP conseguir importar o que a Muntu processou por ela, mesma lógica de "trazer os dados reais para fora" das duas exportações acima. Botão "Exportar mapa" no ecrã **Ordens de compra** (`company_admin`/`system_admin` — o mesmo botão já existia na tela, mas até agora não tinha nenhum handler ligado).

O layout do CSV (`CompanyCode`, `PurchasingDocument`, `DocumentDate`, `ItemNumber`, `VendorName`, `ShortText`, `Currency`, `NetOrderValue`, `POStatus`, `Tier`) aproxima-se de um documento de compra SAP MM (EKKO/EKPO simplificado) — `ItemNumber` fica sempre `000010` (convenção SAP de numeração de item) porque este modelo de PO é só de cabeçalho, sem linhas próprias; `CompanyCode`/`VendorName` usam o id da empresa e o nome do fornecedor reais desta app, não um código SAP verdadeiro (não modelado aqui). **Limitação conhecida:** isto é um mapa estruturado para arranque rápido de reconciliação manual/LSMW, não uma integração BAPI/IDoc certificada — cada empresa terá de mapear estas colunas ao layout exacto que o seu próprio SAP espera.

## Catálogo (preços pré-negociados para "PO catalogado")

O wizard de novo pedido já tinha "PO catalogado" como tipo de transacção (tier automático de facturação, `lib/billing-tiers.ts`) desde uma ronda anterior — mas sem nenhum catálogo real por trás, era só um texto à escolha sem preços nenhuns associados. `catalog_items` (tabela nova) fecha essa lacuna:

- **Curadoria** — só `analyst`/`coe_manager`/`system_admin` registam/editam itens (`POST`/`PATCH /api/catalog[/:id]`) — a empresa cliente e o próprio fornecedor não escolhem o preço pré-negociado, mesma razão por que só a Muntu edita `suppliers.passport`/`risk`.
- **Navegação** — qualquer pessoa autenticada (`requester` incluído, para consultar preços ao preparar um pedido) vê os itens activos; um `supplier` só vê os seus próprios (activos e inactivos, para saber o que já foi retirado); quem cura vê tudo.
- **Retirar sem apagar** — `PATCH` com `{ active: false }` desactiva um item (nunca apaga, para não perder o histórico de POs que já o referenciaram) — o ecrã **Catálogo** tem um botão "Desactivar"/"Reactivar" para quem cura.

Fica deliberadamente por fazer, para uma ronda futura: usar um item de catálogo directamente no wizard de novo pedido (hoje o wizard só tem um campo de valor livre, sem carrinho de itens) — o catálogo já existe como fonte de preços reais, mas ainda não está ligado a essa UI.

## Rotas de API

| Rota | Métodos | Descrição |
| --- | --- | --- |
| `/api/auth/company-lookup` | `POST` | Resolve o domínio do e-mail para uma empresa e o seu método de login |
| `/api/auth/login` | `POST` | Autenticação por e-mail/palavra-passe — define cookie de sessão |
| `/api/auth/sso/start` | `GET` | Inicia o fluxo OIDC (authorization code + PKCE) da empresa |
| `/api/auth/sso/callback` | `GET` | Troca o código OIDC por tokens, verifica o ID token e cria a sessão |
| `/api/auth/me` | `GET` | Utilizador da sessão actual (restaura o login ao recarregar) |
| `/api/auth/logout` | `POST` | Termina a sessão |
| `/api/auth/password-reset/request` | `POST` | Pede um link de recuperação de acesso (resposta genérica, sem enumeração) |
| `/api/auth/password-reset/confirm` | `POST` | Define nova palavra-passe a partir do token do link |
| `/api/dashboard` | `GET` | Métricas agregadas do pipeline P2P |
| `/api/requests` | `GET`, `POST` | Listar/criar pedidos |
| `/api/requests/:id` | `GET`, `PATCH` | Detalhe e aprovar/rejeitar pedido |
| `/api/suppliers` | `GET`, `POST` | Listar/convidar fornecedores — um `supplier` só vê o seu próprio |
| `/api/suppliers/:id` | `PATCH` | Editar fornecedor — interno: tudo (incluindo IBAN/BIC, ver exportação ISO 20022 acima); `supplier`: só o seu, só categoria/conteúdo local |
| `/api/purchase-orders` | `GET` | Ordens de compra |
| `/api/purchase-orders/export/sap` | `GET` | Gera e descarrega o mapa CSV de ordens de compra de uma empresa/período (só `company_admin`/`analyst`/`coe_manager`/`system_admin`) |
| `/api/receipts` | `GET` | Recepções |
| `/api/receipts/:id` | `PATCH` | Confirmar recepção |
| `/api/invoices` | `GET` | Facturas e 3-way match |
| `/api/exceptions` | `GET` | Excepções |
| `/api/exceptions/:id` | `PATCH` | Resolver excepção |
| `/api/payments` | `GET` | Lotes de pagamento |
| `/api/payments/:id` | `PATCH` | Libertar pagamento |
| `/api/payments/:id/export/iso20022` | `GET` | Gera e descarrega o ficheiro pain.001 do lote (facturas validadas da empresa) |
| `/api/documents` | `GET`, `POST` | Repositório documental — `POST` é upload real (`multipart/form-data`, campo `file`, até 15 MB); com `?entityType=&entityId=` (ou os mesmos campos no `POST`), lista/anexa documentos de uma entidade concreta (pedido, fornecedor, factura, recepção, excepção, PO) — âmbito real por linha, não por nível de acesso (ver `lib/document-access.ts`) |
| `/api/documents/:id/download` | `GET` | Descarrega os bytes reais do ficheiro carregado |
| `/api/admin/users` | `GET`, `POST` | `GET`: lista todos os utilizadores; `POST`: cria um utilizador novo (qualquer empresa/fornecedor/nível) — só `system_admin` |
| `/api/admin/users/:id` | `PATCH` | Muda o nível de acesso/empresa de um utilizador (só `system_admin`) |
| `/api/company/users` | `GET`, `POST` | Equipa da própria empresa — só `company_admin`, sempre escopado a `session.companyId`; `POST` convida um colega (`requester`/`company_admin`) sem palavra-passe |
| `/api/admin/companies` | `GET` | Lista as empresas clientes (só `system_admin`) |
| `/api/admin/companies/:id` | `PATCH` | Actualiza retainer, SSO e/ou IBAN/BIC (conta devedora, ver exportação ISO 20022 acima) de uma empresa — só os campos enviados mudam (só `system_admin`) |
| `/api/admin/billing` | `GET`, `POST` | Lista/gera facturas de cobrança a clientes (só `system_admin`) |
| `/api/admin/billing/:id` | `GET`, `PATCH` | Detalhe e aprovar/rejeitar/enviar à contabilidade (só `system_admin`) |
| `/api/admin/billing/generate-monthly` | `POST` | Geração mensal automática — autenticada por `CRON_SECRET`, não por sessão |
| `/api/admin/billing/export/saft` | `GET` | Gera e descarrega o ficheiro SAF-T (AGT) das facturas de cliente aprovadas no período (só `system_admin`) |
| `/api/admin/sla-alerts/run` | `POST` | Alertas de SLA vencido + escalonamento — autenticada por `CRON_SECRET`, não por sessão |
| `/api/admin/payment-release/run` | `POST` | Liberta automaticamente lotes de pagamento sem excepções/risco por resolver — autenticada por `CRON_SECRET`, não por sessão |
| `/api/admin/billing-rates` | `GET` | Lista as tarifas de facturação (só `system_admin`) |
| `/api/admin/billing-rates/:key` | `PATCH` | Actualiza o valor de uma tarifa (só `system_admin`) |
| `/api/support` | `GET`, `POST` | Pedidos de suporte — `GET` lista os próprios (todos para `system_admin`); `POST` abre um pedido com mensagem inicial |
| `/api/support/:id` | `GET`, `PATCH` | Detalhe + fio de mensagens (dono ou `system_admin`); `PATCH` muda estado/prioridade/categoria/responsável (só `system_admin`) |
| `/api/support/:id/messages` | `POST` | Responde num pedido (dono ou `system_admin`) — uma resposta do admin move automaticamente `aberto` → `em_curso` |
| `/api/approvers` | `GET` | Aprovadores reais para o wizard de novo pedido — `company_admin` da própria empresa + todo o `coe_manager`/`system_admin` |
| `/api/public-stats` | `GET` | Estatísticas agregadas e não sensíveis (sem sessão) para o site público e o login — activos, SLA%, ciclo médio |
| `/api/applications` | `GET`, `POST` | `POST` submete uma candidatura (sem sessão); `GET` lista todas (só `coe_manager`/`system_admin`) |
| `/api/applications/:id` | `GET`, `PATCH` | `GET`: detalhe + documentos — por sessão (`coe_manager`/`system_admin`) ou por `?token=` do próprio candidato; `PATCH`: avança o estado (`em_avaliacao`/`aprovada`/`rejeitada`) ou atribui um responsável (`assignedToUserId`) — só interno |
| `/api/applications/:id/documents` | `POST` | Upload pelo próprio candidato — `multipart/form-data`, campos `file` e `token` |
| `/api/applications/:id/documents/:documentId/download` | `GET` | Download pelo próprio candidato (`?token=`) ou por sessão interna |
| `/api/applications/:id/homologate` | `POST` | Cria a empresa/fornecedor + primeiro utilizador a partir de uma candidatura `aprovada` (só `coe_manager`/`system_admin`) |
| `/api/tenders` | `GET`, `POST` | `GET`: lista escopada (fornecedor: só convidado; `company_admin`: só a sua empresa; interno: todos); `POST`: abre tender + convida fornecedores (`company_admin`/`analyst`/`coe_manager`/`system_admin`) |
| `/api/tenders/:id` | `GET`, `PATCH` | `GET`: detalhe — todas as propostas para o comprador, só a própria para um fornecedor; `PATCH`: cancela um tender ainda aberto |
| `/api/tenders/:id/bids` | `POST` | Submete/actualiza a proposta do próprio fornecedor convidado (upsert) |
| `/api/tenders/:id/award` | `POST` | Adjudica uma proposta — marca vencedora/rejeitadas, fecha o tender e gera a PO |
| `/api/contracts` | `GET`, `POST` | `GET`: lista escopada (fornecedor: só os seus; `company_admin`: só a sua empresa; interno: todos); `POST`: regista um contrato |
| `/api/contracts/:id` | `GET`, `PATCH` | `GET`: detalhe (mesmo âmbito); `PATCH`: termina antecipadamente um contrato ainda activo |
| `/api/catalog` | `GET`, `POST` | `GET`: lista escopada (fornecedor: só os seus; interno curador: todos; resto: só activos); `POST`: regista um item (só `analyst`/`coe_manager`/`system_admin`) |
| `/api/catalog/:id` | `PATCH` | Actualização parcial — nome/descrição/categoria/preço/unidade/activo (só `analyst`/`coe_manager`/`system_admin`) |

Todas as rotas excepto `/api/auth/login`, `/api/auth/logout`, `/api/public-stats` e `/api/applications*` exigem sessão válida — `middleware.ts` verifica o cookie `muntu_session` (assinado por HMAC) antes de qualquer rota executar e devolve `401` sem sessão. `/api/applications*` é a excepção mista: nunca bloqueia por falta de sessão (o candidato não tem nenhuma), mas continua a autenticar quando existe uma — ver secção "Candidaturas e homologação" acima.

## Deploy no Render

Este repositório inclui um `render.yaml` (Render Blueprint).

1. No dashboard do Render: **New → Blueprint**, aponte para este repositório GitHub (`tocemedo-cpu/MUNTU-COE`).
2. O Render lê o `render.yaml` e propõe um Web Service Node com:
   - `buildCommand`: `npm ci && npm run db:apply-schema && npm run build`
   - `startCommand`: `npm run start` (liga-se à porta `$PORT` fornecida pelo Render)
3. **Antes de confirmar o deploy**, preencha a variável de ambiente `DATABASE_URL` (connection string do Supabase, a mesma usada localmente). É necessária **no build**, não só em runtime — as rotas de API são analisadas durante `next build`, por isso um build sem `DATABASE_URL` falha logo com um erro claro.
4. Deploy. Não é preciso disco persistente — os dados vivem no Supabase, não no Render.

**`npm run db:apply-schema`** (`scripts/apply-schema.ts`) aplica `supabase/schema.sql` à base de dados de `DATABASE_URL` em cada deploy — sem isto, produção ficava atrás do código real sempre que uma tabela/coluna nova era adicionada (aconteceu três vezes: `support_tickets`, `documents.entity_type`/`entity_id`, `applications`), porque colar o ficheiro no SQL Editor do Supabase era um passo manual, fácil de esquecer. Seguro de correr em todos os deploys: o próprio `schema.sql` só usa `create table if not exists`/`add column if not exists`/`drop policy if exists`, por isso reaplicá-lo nunca apaga nem duplica nada — só cria o que ainda falta. Sem `DATABASE_URL` definida (ex.: primeiro deploy antes de a configurar), o script avisa e sai sem falhar o build.

Alternativa sem Blueprint: criar manualmente um **Web Service** em Render → ligar o repositório → *Environment*: Node → *Build Command*: `npm ci && npm run build` → *Start Command*: `npm run start` → adicionar `DATABASE_URL` nas *Environment Variables*.

**Agendamento externo:** o Web Service por si só não corre `POST /api/admin/billing/generate-monthly`, `POST /api/admin/sla-alerts/run` nem `POST /api/admin/payment-release/run` — precisam de ser chamadas periodicamente com o header `x-cron-secret: <CRON_SECRET>`. `render.yaml` já declara três **Render Cron Jobs** para isto (`muntu-coe-sla-alerts` a cada 15 minutos, `muntu-coe-payment-release` diário às 06:00 UTC, `muntu-coe-billing-monthly` no dia 1 de cada mês às 03:00 UTC — cada um só um `curl` contra a rota já existente, sem código próprio), com `CRON_SECRET` partilhado com o Web Service através de um `envVarGroups` no mesmo Blueprint (garante que os quatro serviços usam sempre o mesmo valor). **Cron Jobs não existem no plano free do Render** — ao sincronizar o Blueprint, escolha um plano pago para os três antes de confirmar (o `render.yaml` deixa `plan` por definir de propósito nesses três serviços, para o dashboard perguntar). Sem confirmar isso no dashboard, o Blueprint falha a sincronizar — este ficheiro não consegue escolher um plano pago por si, é uma decisão de conta/orçamento. Alternativa sem Render Cron Jobs: qualquer agendador externo (GitHub Actions, cron-job.org, ...) a chamar as mesmas três rotas com o mesmo header.

## Base de dados

O schema fica definido em dois sítios sincronizados:

- `supabase/schema.sql` — SQL directo, a fonte usada para provisionar o Supabase.
- `db/schema.ts` — o mesmo modelo em Drizzle, usado pela aplicação e por `drizzle-kit`.

Para gerar migrações versionadas a partir do schema Drizzle:

```bash
npm run db:generate
```

### Ficheiros carregados (Repositório)

Os bytes reais de cada documento vivem em `document_files` (coluna `bytea`), separada de `documents` (só metadados) para que listar/pesquisar documentos nunca puxe ficheiros inteiros para memória — só `GET /api/documents/:id/download` toca essa tabela. Limite de 15 MB por ficheiro (`lib/uploads.ts`). Tal como `users`/`billing_rates`, `document_files` não tem política de `select` — ilegível pela API pública/anon key, só por rotas de servidor. Os 4 documentos de demonstração semeados (`db/seed-data.ts`) são só metadados, sem ficheiro real por trás — o download devolve `404` para eles, o que é esperado.

Para (re)semear os dados de demonstração via Drizzle (idempotente — só insere o que faltar):

```bash
npm run db:seed
```

## Testes

Dois níveis, separados por design:

- **`npm test`** — testes unitários (`tests/unit/`), sem qualquer base de dados: hashing/verificação de password, classificação de tiers de PO/factura, tokens de sessão (assinatura, adulteração, expiração) e os schemas zod. Correm em menos de um segundo, seguros de correr sempre, inclusive sem Postgres instalado.
- **`npm run test:integration`** — testes de integração (`tests/integration/`) contra um Postgres **local** real: login (`POST /api/auth/login`), aprovação de pedido a gerar a PO ligada com o tier certo, geração de factura de cliente (retainer + tiers), o escopo por empresa de `receipts`/`exceptions`/`payments`, a UI de admin de tarifas/retainer/SSO (`/api/admin/billing-rates`, `/api/admin/companies/:id` — incluindo que o client secret nunca é devolvido e sobrevive a um PATCH que não o envie), o upload/download real de documentos (round trip completo dos bytes via `bytea`), a recuperação de acesso (pedido sem enumeração de utilizadores, confirmação com token válido/expirado/mal-tipado, e que a nova password passa a funcionar no login), o fluxo de candidatura/homologação completo (submissão sem sessão, acesso por token vs. por sessão de revisor, transições de estado, upload pelo candidato, e a homologação a criar mesmo a empresa/fornecedor + primeiro utilizador, com os casos de já-homologada e e-mail já existente), e a criação de utilizadores (`/api/admin/users` para qualquer empresa/nível com as validações de companyId/supplierId obrigatório consoante o nível, e `/api/company/users` escopado à empresa da sessão, incluindo que nunca deixa convidar para outra empresa nem atribuir um nível fora de requester/company_admin). Chamam os handlers de rota directamente (sem servidor Next.js a decorrer) com sessões simuladas via os mesmos headers `x-muntu-*` que o `middleware.ts` injecta — por desenho, não passam pelo middleware em si.

Para correr os testes de integração é preciso um Postgres local (nunca aponte isto para o Supabase de produção):

```bash
sudo apt-get install -y postgresql postgresql-contrib   # ou o equivalente no seu SO
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE muntu_test OWNER postgres;"

DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/muntu_test?sslmode=disable" npx drizzle-kit push --force

npm run test:integration
```

O `?sslmode=disable` é a única forma de desligar o SSL na ligação (`db/index.ts`) — sem esse parâmetro explícito, a app exige sempre SSL, tal como em produção. Os testes recusam-se a correr (erro explícito) se `DATABASE_URL` não tiver `sslmode=disable`, precisamente para nunca correr por engano contra a base de dados real.

`.github/workflows/ci.yml` corre tudo isto automaticamente em cada push/PR para `main`: lint + typecheck + build + testes unitários num job, testes de integração contra um serviço Postgres do próprio runner noutro.

---

© 2026 Muntu COE — Luanda, Angola.
