import { z, type ZodSchema } from "zod";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "./support";

/** Como parseJsonBody, mas para um corpo já lido — para rotas que
 * precisam de olhar para o JSON antes de saber contra que schema validar
 * (ex.: PATCH /api/applications/:id, que aceita mudança de estado OU
 * atribuição de responsável no mesmo corpo, nunca os dois). Um Request só
 * dá para ler o corpo uma vez, por isso essas rotas não podem usar
 * parseJsonBody directamente.*/
export function validateBody<T>(
  json: unknown,
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; response: Response } {
  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Payload inválido";
    return { success: false, response: Response.json({ error: message }, { status: 400 }) };
  }
  return { success: true, data: result.data };
}

export async function parseJsonBody<T>(request: Request, schema: ZodSchema<T>) {
  const json = await request.json().catch(() => null);
  return validateBody(json, schema);
}

export const loginSchema = z.object({
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  password: z.string().min(1, "Palavra-passe é obrigatória"),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Link inválido"),
  password: z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres"),
});

export const requestCreateSchema = z.object({
  tower: z.string().trim().min(1).max(80).default("Requisition-to-PO"),
  type: z.string().trim().max(80).optional(),
  subject: z.string().trim().max(200).optional(),
  costCenter: z.string().trim().max(80).optional().default(""),
  supplier: z.string().trim().max(200).optional().default(""),
  value: z.string().trim().max(40).optional(),
  due: z.string().trim().max(40).optional(),
  approver: z.string().trim().max(200).optional(),
  priority: z.enum(["Alta", "Média", "Normal"]).optional().default("Média"),
  notes: z.string().trim().max(2000).optional(),
});

// overrideRisk: confirmação explícita para aprovar mesmo com o fornecedor
// classificado risco "Alto" — sem isto, a aprovação é bloqueada (ver
// PATCH /api/requests/:id). Só company_admin/coe_manager/system_admin
// chegam a este ponto, mas só coe_manager/system_admin podem de facto
// usar o override (verificado no handler, não aqui).
export const requestActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  overrideRisk: z.boolean().optional(),
});

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, "O nome do fornecedor é obrigatório").max(200),
  category: z.string().trim().max(120).optional(),
});

// Edição interna (Muntu): pode mexer em tudo, incluindo passport/risco/
// estado — são avaliações da Muntu, não auto-declaradas pelo fornecedor.
export const supplierUpdateSchema = z.object({
  category: z.string().trim().max(120).optional(),
  local: z.string().trim().max(20).optional(),
  passport: z.number().int().min(0).max(100).optional(),
  risk: z.enum(["Baixo", "Médio", "Alto"]).optional(),
  status: z.string().trim().max(60).optional(),
});

// Auto-edição do fornecedor: só os campos que ele próprio pode declarar.
export const supplierSelfUpdateSchema = z.object({
  category: z.string().trim().max(120).optional(),
  local: z.string().trim().max(20).optional(),
});

export const receiptActionSchema = z.object({
  action: z.literal("confirm"),
});

export const exceptionActionSchema = z.object({
  action: z.literal("resolve"),
});

export const paymentActionSchema = z.object({
  action: z.literal("release"),
});

export const userAccessUpdateSchema = z.object({
  accessLevel: z.enum(["system_admin", "coe_manager", "analyst", "supplier", "company_admin", "requester"]),
  companyId: z.number().int().positive().nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
});

export const clientInvoiceGenerateSchema = z.object({
  companyId: z.number().int().positive(),
  periodStart: z.string().trim().min(1, "Data de início é obrigatória"),
  periodEnd: z.string().trim().min(1, "Data de fim é obrigatória"),
  scope: z.enum(["parcial", "total"]).default("total"),
});

export const clientInvoiceActionSchema = z.object({
  action: z.enum(["approve", "reject", "send_to_accounting"]),
});

export const billingRateUpdateSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000),
});

// Actualização parcial: só os campos presentes são alterados. ssoClientSecret
// em branco/omitido significa "manter o actual" (nunca devolvido pelo GET,
// não há como o formulário o reenviar sem querer trocá-lo).
export const companyUpdateSchema = z.object({
  retainerAmount: z.number().int().min(0).max(1_000_000_000).optional(),
  authMethod: z.enum(["password", "sso"]).optional(),
  ssoIssuerUrl: z.string().trim().max(500).optional(),
  ssoClientId: z.string().trim().max(200).optional(),
  ssoClientSecret: z.string().trim().max(500).optional(),
});

export const supportTicketCreateSchema = z.object({
  subject: z.string().trim().min(1, "O assunto é obrigatório").max(200),
  category: z.enum(SUPPORT_CATEGORIES).optional().default("Geral"),
  priority: z.enum(SUPPORT_PRIORITIES).optional().default("normal"),
  message: z.string().trim().min(1, "A mensagem é obrigatória").max(4000),
});

// Actualização parcial (system_admin): só os campos presentes mudam.
export const supportTicketUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  category: z.enum(SUPPORT_CATEGORIES).optional(),
  assignedToUserId: z.number().int().positive().nullable().optional(),
});

export const supportMessageCreateSchema = z.object({
  body: z.string().trim().min(1, "A mensagem é obrigatória").max(4000),
});

export const applicationCreateSchema = z.object({
  kind: z.enum(["empresa", "fornecedor"]),
  companyName: z.string().trim().min(1, "O nome da empresa é obrigatório").max(200),
  taxId: z.string().trim().min(1, "O NIF é obrigatório").max(40),
  sector: z.string().trim().max(120).optional(),
  contactName: z.string().trim().min(1, "O nome do contacto é obrigatório").max(200),
  contactEmail: z.string().trim().min(1, "O e-mail é obrigatório").email("E-mail inválido"),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// Criação directa de utilizador (System Admin, qualquer empresa/nível) —
// ver POST /api/admin/users. companyId/supplierId só são obrigatórios
// para os níveis que realmente precisam deles (mesma regra aplicada em
// db/schema.ts: um "requester"/"company_admin" sem companyId ou um
// "supplier" sem supplierId fica sem âmbito nenhum).
export const adminUserCreateSchema = z
  .object({
    name: z.string().trim().min(1, "O nome é obrigatório").max(200),
    email: z.string().trim().min(1, "O e-mail é obrigatório").email("E-mail inválido"),
    role: z.string().trim().max(120).optional(),
    accessLevel: z.enum(["system_admin", "coe_manager", "analyst", "supplier", "company_admin", "requester"]),
    companyId: z.number().int().positive().optional(),
    supplierId: z.number().int().positive().optional(),
  })
  .refine((data) => (["company_admin", "requester"].includes(data.accessLevel) ? data.companyId != null : true), {
    message: "Indique a empresa para este nível de acesso",
    path: ["companyId"],
  })
  .refine((data) => (data.accessLevel === "supplier" ? data.supplierId != null : true), {
    message: "Indique o fornecedor para este nível de acesso",
    path: ["supplierId"],
  });

// Convite de um colega para a própria empresa (Administrador da empresa)
// — ver POST /api/company/users. Sem companyId no corpo de propósito: vem
// sempre da sessão, nunca escolhido pelo chamador — é isso que impede um
// company_admin de criar um utilizador fora da sua própria empresa.
export const companyUserInviteSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200),
  email: z.string().trim().min(1, "O e-mail é obrigatório").email("E-mail inválido"),
  accessLevel: z.enum(["requester", "company_admin"]).default("requester"),
});

export const applicationReviewSchema = z.union([
  z.object({ status: z.literal("em_avaliacao") }),
  z.object({ status: z.literal("aprovada") }),
  z.object({
    status: z.literal("rejeitada"),
    rejectionReason: z.string().trim().min(1, "Indique o motivo da rejeição").max(1000),
  }),
]);

// Atribuição de responsável — corpo separado do de mudança de estado
// (applicationReviewSchema), tratado como uma acção distinta pelo mesmo
// PATCH /api/applications/:id: o chamador manda um dos dois, nunca ambos.
export const applicationAssignSchema = z.object({
  assignedToUserId: z.number().int().positive().nullable(),
});

// Tender/Sourcing (RFQ) — ver POST /api/tenders. companyId só é usado (e
// obrigatório) quando quem cria não tem uma empresa própria na sessão
// (coe_manager/system_admin); para um company_admin vem sempre da
// sessão, nunca deste campo — mesma razão de segurança de
// companyUserInviteSchema.
export const tenderCreateSchema = z.object({
  title: z.string().trim().min(1, "O título é obrigatório").max(200),
  description: z.string().trim().max(2000).optional(),
  deadline: z.string().trim().min(1, "Indique o prazo para propostas"),
  requestId: z.string().trim().max(40).optional(),
  companyId: z.number().int().positive().optional(),
  supplierIds: z.array(z.number().int().positive()).min(1, "Convide pelo menos um fornecedor"),
});

export const tenderActionSchema = z.object({ action: z.literal("cancel") });

export const bidCreateSchema = z.object({
  value: z.number().int().min(0, "O valor da proposta é obrigatório"),
  notes: z.string().trim().max(2000).optional(),
});

// overrideRisk: mesma regra de requestActionSchema — confirmação
// explícita para adjudicar a uma proposta de fornecedor risco "Alto".
export const tenderAwardSchema = z.object({
  bidId: z.number().int().positive(),
  overrideRisk: z.boolean().optional(),
});

// Contratos/Call-off — mesma regra de âmbito que tenderCreateSchema:
// companyId só é usado (e obrigatório) quando quem cria não tem empresa
// própria na sessão; para um company_admin vem sempre da sessão.
export const contractCreateSchema = z
  .object({
    title: z.string().trim().min(1, "O título é obrigatório").max(200),
    supplierId: z.number().int().positive("Indique o fornecedor"),
    companyId: z.number().int().positive().optional(),
    requestId: z.string().trim().max(40).optional(),
    value: z.number().int().min(0).max(1_000_000_000_000),
    startDate: z.string().trim().min(1, "Indique a data de início"),
    endDate: z.string().trim().min(1, "Indique a data de fim"),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "A data de fim tem de ser posterior à data de início",
    path: ["endDate"],
  });

export const contractActionSchema = z.object({ action: z.literal("terminate") });

export const catalogItemCreateSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório").max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(120).optional(),
  supplierId: z.number().int().positive("Indique o fornecedor"),
  unitPrice: z.number().int().min(0).max(1_000_000_000),
  unit: z.string().trim().min(1).max(20).optional(),
});

// Actualização parcial: só os campos presentes mudam — inclui a
// activação/desactivação (retirar um item do catálogo sem apagar o
// histórico de POs que já o referenciaram).
export const catalogItemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(120).optional(),
  unitPrice: z.number().int().min(0).max(1_000_000_000).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  active: z.boolean().optional(),
});
