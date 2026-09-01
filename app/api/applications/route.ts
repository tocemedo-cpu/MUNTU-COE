import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { applications } from "@/db/schema";
import { APPLICATION_REVIEW_ROLES, APPLICATION_TOKEN_TTL_SECONDS, type ApplicationTokenPayload } from "@/lib/application-access";
import { getOptionalSession } from "@/lib/authz";
import { isUniqueViolation } from "@/lib/db-errors";
import { sendApplicationReceivedEmail } from "@/lib/mailer";
import { clientIp, isRateLimited, rateLimitResponse } from "@/lib/rate-limit";
import { publicOrigin } from "@/lib/request-origin";
import { signPayload } from "@/lib/session";
import { applicationCreateSchema, parseJsonBody } from "@/lib/validation";

// Sem sessão nenhuma exigida de propósito (ver comentário do POST abaixo)
// — sem isto, ficava aberto a spam ilimitado de candidaturas.
const APPLICATION_SUBMIT_LIMIT = 5;
const APPLICATION_SUBMIT_WINDOW_MS = 60 * 60 * 1000;

// Listagem interna (Muntu) das candidaturas por avaliar/homologar. Quem
// ainda não tem sessão nenhuma (o candidato) nunca chega aqui — a consulta
// da própria candidatura é feita por GET /api/applications/[id]?token=...
export async function GET(request: Request) {
  const session = getOptionalSession(request);
  if (!session || !APPLICATION_REVIEW_ROLES.includes(session.accessLevel)) {
    return Response.json({ error: "Sem permissão para aceder a este recurso." }, { status: 403 });
  }

  const db = getDb();
  const rows = await db.select().from(applications).orderBy(desc(applications.createdAt));
  return Response.json({ applications: rows });
}

// Submissão pública de candidatura — o primeiro contacto real com a
// plataforma para quem ainda não tem conta nenhuma (empresa ou
// fornecedor). Sem sessão nenhuma de propósito: ver middleware.ts
// (OPTIONAL_AUTH_PREFIXES) e o README, secção "Como um utilizador real
// chega à plataforma".
export async function POST(request: Request) {
  if (isRateLimited(`application-submit:${clientIp(request)}`, APPLICATION_SUBMIT_LIMIT, APPLICATION_SUBMIT_WINDOW_MS)) {
    return rateLimitResponse();
  }

  const db = getDb();
  const parsed = await parseJsonBody(request, applicationCreateSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const created = await insertApplicationWithGeneratedId(db, {
    kind: payload.kind,
    companyName: payload.companyName.trim(),
    taxId: payload.taxId.trim(),
    sector: payload.sector?.trim() || "",
    contactName: payload.contactName.trim(),
    contactEmail: payload.contactEmail.trim().toLowerCase(),
    contactPhone: payload.contactPhone?.trim() || "",
    notes: payload.notes?.trim() || "",
  });

  const token = await signPayload<Omit<ApplicationTokenPayload, "exp">>(
    { applicationId: created.id, purpose: "application_access" },
    APPLICATION_TOKEN_TTL_SECONDS
  );

  const origin = publicOrigin(request);
  const statusUrl = `${origin}/?application_token=${encodeURIComponent(token)}&application_id=${encodeURIComponent(created.id)}#candidatura`;
  try {
    await sendApplicationReceivedEmail(created.contactEmail, created.id, statusUrl);
  } catch (error) {
    console.error("Falha ao enviar e-mail de confirmação de candidatura:", error);
  }

  return Response.json({ application: created, token }, { status: 201 });
}

type NewApplicationValues = Omit<typeof applications.$inferInsert, "id">;

// Mesmo padrão de id aleatório + nova tentativa em colisão já usado para
// pedidos/POs/tickets de suporte — ver app/api/requests/route.ts.
async function insertApplicationWithGeneratedId(db: ReturnType<typeof getDb>, values: NewApplicationValues) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `CAND-2026-${1000 + Math.floor(Math.random() * 9000)}`;
    try {
      const [created] = await db.insert(applications).values({ id, ...values }).returning();
      return created;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Não foi possível gerar um id de candidatura único");
}
