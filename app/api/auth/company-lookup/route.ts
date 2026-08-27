import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { z } from "zod";
import { parseJsonBody } from "@/lib/validation";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, schema);
  if (!parsed.success) return parsed.response;

  const domain = parsed.data.email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return Response.json({ authMethod: "password" as const });
  }

  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.domain, domain));

  if (!company) {
    // Domínio sem empresa registada — cai no login por e-mail/password
    // (cobre as contas internas Muntu e de fornecedores).
    return Response.json({ authMethod: "password" as const });
  }

  return Response.json({
    authMethod: company.authMethod as "password" | "sso",
    companyName: company.name,
  });
}
