import { z, type ZodSchema } from "zod";

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  const json = await request.json().catch(() => null);
  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Payload inválido";
    return { success: false, response: Response.json({ error: message }, { status: 400 }) };
  }
  return { success: true, data: result.data };
}

export const loginSchema = z.object({
  email: z.string().trim().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  password: z.string().min(1, "Palavra-passe é obrigatória"),
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

export const requestActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
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

export const documentCreateSchema = z.object({
  name: z.string().trim().min(1, "O nome do documento é obrigatório").max(300),
  type: z.string().trim().max(80).optional(),
  request: z.string().trim().max(80).optional(),
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
