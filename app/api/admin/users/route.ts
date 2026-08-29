import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, suppliers, users } from "@/db/schema";
import { adminUserCreateSchema, parseJsonBody } from "@/lib/validation";
import { DEFAULT_ROLE_LABEL, provisionUserWithoutPassword } from "@/lib/user-provisioning";

export async function GET() {
  const db = getDb();
  const rows = await db.select().from(users);
  const companyRows = await db.select().from(companies);
  const supplierRows = await db.select().from(suppliers);
  const companyNameById = new Map(companyRows.map((c) => [c.id, c.name]));
  const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));

  return Response.json({
    users: rows.map(({ password: _password, ...user }) => ({
      ...user,
      companyName: user.companyId != null ? (companyNameById.get(user.companyId) ?? null) : null,
      supplierName: user.supplierId != null ? (supplierNameById.get(user.supplierId) ?? null) : null,
    })),
  });
}

// Cria um utilizador real — só System Admin (garantido pelo prefixo
// /api/admin em middleware.ts), para qualquer empresa/fornecedor e
// qualquer nível de acesso. Ver POST /api/company/users para o convite
// escopado que o próprio Administrador da empresa pode fazer.
export async function POST(request: Request) {
  const db = getDb();
  const parsed = await parseJsonBody(request, adminUserCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const email = payload.email.trim().toLowerCase();
  const [existingUser] = await db.select().from(users).where(eq(users.email, email));
  if (existingUser) {
    return Response.json({ error: `Já existe um utilizador com o e-mail ${email}.` }, { status: 409 });
  }

  if (payload.companyId != null) {
    const [company] = await db.select().from(companies).where(eq(companies.id, payload.companyId));
    if (!company) return Response.json({ error: "Empresa não encontrada" }, { status: 400 });
  }
  if (payload.supplierId != null) {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, payload.supplierId));
    if (!supplier) return Response.json({ error: "Fornecedor não encontrado" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const newUser = await provisionUserWithoutPassword(
    db,
    {
      name: payload.name.trim(),
      email,
      role: payload.role?.trim() || DEFAULT_ROLE_LABEL[payload.accessLevel],
      accessLevel: payload.accessLevel,
      companyId: payload.companyId,
      supplierId: payload.supplierId,
    },
    origin
  );

  const { password: _password, ...safeUser } = newUser;
  return Response.json({ user: safeUser }, { status: 201 });
}
