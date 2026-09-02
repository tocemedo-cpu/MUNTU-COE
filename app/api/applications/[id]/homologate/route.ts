import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { applications, companies, suppliers, users } from "@/db/schema";
import { APPLICATION_REVIEW_ROLES } from "@/lib/application-access";
import { recordAuditEvent } from "@/lib/audit";
import { getOptionalSession } from "@/lib/authz";
import { publicOrigin } from "@/lib/request-origin";
import { assertDifferentActor } from "@/lib/sod";
import { provisionUserWithoutPassword } from "@/lib/user-provisioning";

// Homologação (Aprovada -> Homologação -> Acesso Muntu): a única acção que
// transforma uma candidatura em conta real. Cria a empresa/fornecedor e o
// seu primeiro utilizador (sem palavra-passe ainda) e envia o link de
// "definir palavra-passe" — reaproveita a mesma infra do fluxo de
// recuperação de acesso (lib/session.ts#signPayload +
// /api/auth/password-reset/confirm), só muda o texto do e-mail.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = getOptionalSession(request);
  if (!session || !APPLICATION_REVIEW_ROLES.includes(session.accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();
  const [application] = await db.select().from(applications).where(eq(applications.id, id));
  if (!application) return Response.json({ error: "Candidatura não encontrada" }, { status: 404 });
  if (application.status !== "aprovada") {
    return Response.json({ error: "Só é possível homologar uma candidatura já aprovada." }, { status: 400 });
  }
  // Candidatura de empresa cliente continua governance pura do COE
  // Manager; supplier_governance só controla o lado fornecedor (ver
  // README §Personas e permissões).
  if (application.kind === "empresa" && session.accessLevel !== "coe_manager") {
    return Response.json({ error: "Só o COE Manager pode homologar uma candidatura de empresa." }, { status: 403 });
  }
  // Segregação de funções: quem aprovou (moveu para "aprovada") não pode
  // ser quem homologa — duas pessoas diferentes têm de fechar o círculo.
  const sodError = assertDifferentActor(session.userId, application.reviewedByUserId, "Quem aprovou esta candidatura não pode ser quem a homologa.");
  if (sodError) return sodError;

  const [existingUser] = await db.select().from(users).where(eq(users.email, application.contactEmail));
  if (existingUser) {
    return Response.json({ error: `Já existe um utilizador com o e-mail ${application.contactEmail}.` }, { status: 409 });
  }

  const origin = publicOrigin(request);
  let createdCompanyId: number | null = null;
  let createdSupplierId: number | null = null;
  let createdUserId: number;

  if (application.kind === "empresa") {
    const domain = application.contactEmail.split("@")[1] ?? "";
    const [existingCompany] = domain ? await db.select().from(companies).where(eq(companies.domain, domain)) : [];
    if (existingCompany) {
      return Response.json(
        { error: `Já existe uma empresa registada com o domínio ${domain}. Adicione o utilizador a partir de Administração > Utilizadores.` },
        { status: 409 }
      );
    }

    const [newCompany] = await db
      .insert(companies)
      .values({ name: application.companyName, domain, authMethod: "password", taxId: application.taxId })
      .returning();
    createdCompanyId = newCompany.id;

    const newUser = await provisionUserWithoutPassword(
      db,
      {
        name: application.contactName,
        email: application.contactEmail,
        role: "Administrador da empresa",
        accessLevel: "company_admin",
        companyId: newCompany.id,
      },
      origin
    );
    createdUserId = newUser.id;
  } else {
    const [newSupplier] = await db
      .insert(suppliers)
      .values({
        name: application.companyName,
        category: application.sector || "Por classificar",
        passport: 0,
        risk: "Médio",
        local: "0%",
        status: "Documentos",
      })
      .returning();
    createdSupplierId = newSupplier.id;

    const newUser = await provisionUserWithoutPassword(
      db,
      {
        name: application.contactName,
        email: application.contactEmail,
        role: "Fornecedor",
        accessLevel: "supplier",
        supplierId: newSupplier.id,
      },
      origin
    );
    createdUserId = newUser.id;
  }

  const [updated] = await db
    .update(applications)
    .set({
      status: "homologada",
      homologatedAt: new Date(),
      reviewedByUserId: session.userId,
      reviewedAt: new Date(),
      createdCompanyId,
      createdSupplierId,
      createdUserId,
    })
    .where(eq(applications.id, id))
    .returning();

  await recordAuditEvent(db, {
    actorUserId: session.userId,
    action: "application.homologate",
    entityType: "application",
    entityId: id,
    after: { createdCompanyId, createdSupplierId, createdUserId },
  });

  return Response.json({ application: updated });
}
