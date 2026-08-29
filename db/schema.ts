import { sql } from "drizzle-orm";
import { bigint, boolean, customType, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Empresa cliente (a "tenant" que compra através do portal). O método de
// login (SSO federado vs. e-mail/password) é decidido por empresa: o login
// resolve o domínio do e-mail para uma linha aqui antes de decidir qual
// fluxo mostrar. As colunas sso_* só produzem um login funcional quando a
// empresa fornece as credenciais reais do seu fornecedor de identidade
// (Entra ID, Google Workspace, Okta, ...) — ver README para o fluxo OIDC.
export const companies = pgTable("companies", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  authMethod: text("auth_method").notNull().default("password"), // "password" | "sso"
  ssoIssuerUrl: text("sso_issuer_url"),
  ssoClientId: text("sso_client_id"),
  ssoClientSecret: text("sso_client_secret"),
  // Retainer mensal negociado (AOA). Sem valor definido, a facturação de
  // actividade usa 0 para esta linha — ver Estudo de Viabilidade §32.4/53.1.
  retainerAmount: bigint("retainer_amount", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Nula para utilizadores federados por SSO (não têm password local).
  password: text("password"),
  role: text("role").notNull(),
  initials: text("initials").notNull(),
  tenant: text("tenant").notNull().default("Operadora Atlântico, SA"),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  // Só para accessLevel = "supplier": qual fornecedor este utilizador
  // representa. Sem isto ligado, o utilizador não vê POs/recepções/
  // facturas nenhumas (âmbito vazio por omissão — nunca "vê tudo").
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  // Autorização real (usada por middleware/rotas).
  accessLevel: text("access_level").notNull().default("requester"), // system_admin | coe_manager | analyst | supplier | company_admin | requester
  ssoSubject: text("sso_subject"),
});

export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  tower: text("tower").notNull(),
  // Tipo de transacção escolhido no wizard (ex.: "PO standard", "Compra
  // urgente", "PO catalogado"). Determina o tier de facturação da PO
  // gerada na aprovação — ver lib/billing.ts.
  type: text("type").notNull().default("PO standard"),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(),
  priority: text("priority").notNull(),
  owner: text("owner").notNull(),
  ownerUserId: bigint("owner_user_id", { mode: "number" }).references(() => users.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  sla: text("sla").notNull(),
  stage: integer("stage").notNull().default(0),
  submitted: text("submitted").notNull(),
  supplier: text("supplier").notNull(),
  costCenter: text("cost_center").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  // Prazo real de decisão (aprovar/rejeitar), calculado a partir da
  // prioridade no momento da criação — ver lib/requests-sla.ts. Substitui
  // os vários números de "SLA %"/"ciclo médio" fixos no código que
  // existiam espalhados pelo frontend (login, dashboard, relatórios):
  // agora há uma só fonte real, calculada a partir destes dois campos.
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  // Preenchido quando o pedido é aprovado ou rejeitado (app/api/requests/
  // [id]/route.ts). Nulo enquanto o pedido aguarda decisão.
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const suppliers = pgTable("suppliers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  passport: integer("passport").notNull().default(0),
  risk: text("risk").notNull().default("Médio"),
  local: text("local").notNull().default("0%"),
  status: text("status").notNull().default("Documentos"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  description: text("description").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull(),
  nextAction: text("next_action").notNull().default(""),
  requestId: text("request_id").references(() => requests.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  // automatico | standard | complexo — ver lib/billing.ts
  tier: text("tier").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Tender/Sourcing (RFQ) — pedido de cotação a vários fornecedores
// convidados, com adjudicação a uma proposta que gera a PO. Primeira fase
// real do pilar Procurement: até agora só existia a emissão de PO a
// partir de um pedido já aprovado, sem nenhum processo de sourcing
// concorrencial antes disso.
export const tenders = pgTable("tenders", {
  id: text("id").primaryKey(), // "RFQ-2026-####"
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  companyId: bigint("company_id", { mode: "number" })
    .notNull()
    .references(() => companies.id),
  // Opcional — um tender pode nascer de um pedido já aprovado (sourcing
  // formal antes de emitir a PO) ou ser aberto directamente pela Muntu.
  requestId: text("request_id").references(() => requests.id),
  createdByUserId: bigint("created_by_user_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("aberto"), // aberto | adjudicado | cancelado
  // Sem FK para bids de propósito — bids só é declarada a seguir a esta
  // tabela (evita referência circular na ordem do ficheiro); a
  // integridade é garantida pela própria rota de adjudicação (só o
  // handler escreve os dois campos, sempre juntos).
  awardedBidId: bigint("awarded_bid_id", { mode: "number" }),
  awardedPoId: text("awarded_po_id").references(() => purchaseOrders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Fornecedores convidados a um tender — sem convite, um fornecedor nem
// sequer vê o tender existir (ver GET /api/tenders para requester
// supplier). Um índice único impede convidar o mesmo fornecedor duas
// vezes ao mesmo tender.
export const tenderInvites = pgTable(
  "tender_invites",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tenders.id),
    supplierId: bigint("supplier_id", { mode: "number" })
      .notNull()
      .references(() => suppliers.id),
  },
  (table) => [uniqueIndex("tender_invites_tender_supplier_idx").on(table.tenderId, table.supplierId)]
);

// Proposta de um fornecedor convidado. Um fornecedor só vê a sua própria
// proposta, nunca as dos concorrentes — ver canAccessBid-style scoping em
// GET /api/tenders/:id.
export const bids = pgTable(
  "bids",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tenders.id),
    supplierId: bigint("supplier_id", { mode: "number" })
      .notNull()
      .references(() => suppliers.id),
    value: bigint("value", { mode: "number" }).notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("submetida"), // submetida | vencedora | rejeitada
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [uniqueIndex("bids_tender_supplier_idx").on(table.tenderId, table.supplierId)]
);

// Contrato/Call-off — acordo com validade e tecto de valor, distinto de
// uma PO pontual. O estado "activo"/"terminado" só regista o que uma
// pessoa decidiu (terminar antecipadamente); "a expirar"/"expirado" nunca
// são gravados — são sempre calculados a partir de endDate, para nunca
// ficarem desactualizados (mesmo princípio já usado na linha temporal da
// PO: derivado, não fabricado).
export const contracts = pgTable("contracts", {
  id: text("id").primaryKey(), // "CTR-2026-####"
  title: text("title").notNull(),
  supplier: text("supplier").notNull(),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  companyId: bigint("company_id", { mode: "number" })
    .notNull()
    .references(() => companies.id),
  requestId: text("request_id").references(() => requests.id),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("activo"), // activo | terminado
  createdByUserId: bigint("created_by_user_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const receipts = pgTable("receipts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  po: text("po").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier").notNull(),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("Em curso"),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  po: text("po").notNull(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  match: text("match").notNull(),
  status: text("status").notNull(),
  due: text("due").notNull(),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
  // limpa | assistida | excecao — ver lib/billing.ts
  tier: text("tier").notNull().default("assistida"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const exceptions = pgTable("exceptions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  ref: text("ref").notNull(),
  owner: text("owner").notNull(),
  // Causa-raiz para o relatório "Excepções por causa" (lib/requests-sla.ts
  // não toca nisto — é agregado directamente pelo frontend a partir da
  // lista já carregada). Texto livre, não um enum: a lista de causas reais
  // cresce com o que a operação encontra, não é fixa à partida.
  cause: text("cause").notNull().default("Outros"),
  impact: text("impact").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  // Substitui a antiga coluna "age" (texto fixo tipo "2h 14m", nunca
  // actualizado). A idade real é agora calculada no frontend a partir
  // deste timestamp em cada render, em vez de ficar gravada e a envelhecer
  // mal (formatElapsedPt em app/page.tsx).
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const paymentBatches = pgTable("payment_batches", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  count: integer("count").notNull().default(0),
  value: bigint("value", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("Pronto"),
  released: boolean("released").notNull().default(false),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
});

// Tabelas de preço por unidade (Estudo de Viabilidade §32.4/53.1 —
// modelo híbrido retainer + PO + factura). Valores por omissão são o
// ponto médio de cada intervalo indicativo do estudo, em AOA. Editável
// via SQL directo por agora (sem UI de administração de preços).
export const billingRates = pgTable("billing_rates", {
  key: text("key").primaryKey(), // po_automatico | po_standard | po_complexo | invoice_limpa | invoice_assistida | invoice_excecao
  label: text("label").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Factura de cobrança da Muntu a uma empresa cliente (distinta de
// `invoices`, que são as facturas de fornecedor no fluxo Invoice-to-Pay).
export const clientInvoices = pgTable("client_invoices", {
  id: text("id").primaryKey(),
  companyId: bigint("company_id", { mode: "number" })
    .notNull()
    .references(() => companies.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  scope: text("scope").notNull().default("total"), // parcial | total
  status: text("status").notNull().default("pendente_aprovacao"), // pendente_aprovacao | aprovada | rejeitada | enviada_contabilidade
  generatedBy: text("generated_by").notNull().default("manual"), // automatico | manual
  retainerAmount: bigint("retainer_amount", { mode: "number" }).notNull().default(0),
  poAmount: bigint("po_amount", { mode: "number" }).notNull().default(0),
  invoiceAmount: bigint("invoice_amount", { mode: "number" }).notNull().default(0),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  reviewedByUserId: bigint("reviewed_by_user_id", { mode: "number" }).references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const clientInvoiceLines = pgTable("client_invoice_lines", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  clientInvoiceId: text("client_invoice_id")
    .notNull()
    .references(() => clientInvoices.id),
  kind: text("kind").notNull(), // retainer | po | invoice
  referenceId: text("reference_id"), // id da PO ou da factura de fornecedor de origem
  tier: text("tier"),
  description: text("description").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
});

export const documents = pgTable("documents", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  request: text("request").notNull(),
  owner: text("owner").notNull(),
  version: text("version").notNull().default("v1"),
  updated: text("updated").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  // Ligação real a quem este documento pertence — "request" | "supplier" |
  // "invoice" | "receipt" | "exception" | "purchase_order", com entityId a
  // guardar o id dessa linha (todos os tipos de PK coercem bem para
  // texto). Substitui o antigo padrão de só ter `request` como texto
  // livre, que nunca ligava de verdade a nada fora dos pedidos — é o que
  // alimenta os botões "Ver evidência"/"Ver Supplier Passport"/etc. que
  // antes só mostravam um toast. Nulo para uploads gerais do Repositório,
  // sem entidade específica.
  entityType: text("entity_type"),
  entityId: text("entity_id"),
});

// Ficheiro real associado a um `documents.id` — separado da tabela acima
// para que listar/pesquisar documentos (`GET /api/documents`) nunca puxe
// os bytes de todos os ficheiros para memória; só `GET
// /api/documents/:id/download` toca esta tabela.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const documentFiles = pgTable("document_files", {
  documentId: bigint("document_id", { mode: "number" })
    .primaryKey()
    .references(() => documents.id),
  content: bytea("content").notNull(),
});

// Candidatura de uma empresa ("Operadora") ou fornecedor ("Prestadora") ao
// Centro de Excelência — o primeiro contacto real com a plataforma, para
// quem ainda não tem conta nenhuma (ver Candidatura → Documentos →
// Avaliação → Aprovada/Rejeitada → Homologação → Acesso Muntu). Só depois
// de homologada é que existe de facto uma empresa/fornecedor com um
// primeiro utilizador — ver `homologate/route.ts`.
export const applications = pgTable("applications", {
  id: text("id").primaryKey(), // "CAND-2026-####"
  kind: text("kind").notNull(), // "empresa" | "fornecedor"
  companyName: text("company_name").notNull(),
  taxId: text("tax_id").notNull(),
  sector: text("sector").notNull().default(""),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("recebida"), // recebida | em_avaliacao | aprovada | rejeitada | homologada
  rejectionReason: text("rejection_reason"),
  // Quem está a tratar esta candidatura — diferente de reviewedByUserId
  // (quem foi a última pessoa a mudar o estado): pode haver um
  // responsável atribuído sem ainda ter havido nenhuma decisão. Mesmo
  // padrão já usado em support_tickets.assigned_to_user_id.
  assignedToUserId: bigint("assigned_to_user_id", { mode: "number" }).references(() => users.id),
  reviewedByUserId: bigint("reviewed_by_user_id", { mode: "number" }).references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  homologatedAt: timestamp("homologated_at", { withTimezone: true }),
  // Preenchidos só pela homologação — a prova real de que esta candidatura
  // deu origem à empresa/fornecedor/utilizador em causa, não só um estado.
  createdCompanyId: bigint("created_company_id", { mode: "number" }).references(() => companies.id),
  createdSupplierId: bigint("created_supplier_id", { mode: "number" }).references(() => suppliers.id),
  createdUserId: bigint("created_user_id", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Caixa de suporte: qualquer utilizador autenticado pode abrir um pedido;
// só o System Admin vê a caixa de entrada completa e pode categorizar,
// priorizar, atribuir e responder — ver lib/support.ts para o cálculo do
// prazo de SLA por prioridade.
export const supportTickets = pgTable("support_tickets", {
  id: text("id").primaryKey(), // "SUP-2026-####"
  subject: text("subject").notNull(),
  category: text("category").notNull().default("Geral"),
  priority: text("priority").notNull().default("normal"), // baixa | normal | alta | urgente
  status: text("status").notNull().default("aberto"), // aberto | em_curso | resolvido | fechado
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  companyId: bigint("company_id", { mode: "number" }).references(() => companies.id),
  assignedToUserId: bigint("assigned_to_user_id", { mode: "number" }).references(() => users.id),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const supportMessages = pgTable("support_messages", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => supportTickets.id),
  authorUserId: bigint("author_user_id", { mode: "number" })
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Marca um token de uso único (jti, ver lib/session.ts#generateJti) como
// já consumido — usado pelos tokens de recuperação de acesso/boas-vindas
// (password_reset), que só devem poder repor a password uma vez. A PK em
// jti é a própria garantia de "uso único": um segundo consumo do mesmo
// jti falha por violação de unicidade. Não se aplica ao token de acesso à
// candidatura (application_access), que precisa de continuar a servir
// vários pedidos (estado + upload) ao longo da janela de 30 dias.
export const consumedTokens = pgTable("consumed_tokens", {
  jti: text("jti").primaryKey(),
  purpose: text("purpose").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().default(sql`now()`),
});
