import { clearCsrfCookieHeader } from "@/lib/csrf";
import { clearSessionCookieHeader } from "@/lib/session";

export async function POST() {
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookieHeader());
  headers.append("Set-Cookie", clearCsrfCookieHeader());
  return Response.json({ ok: true }, { headers });
}
