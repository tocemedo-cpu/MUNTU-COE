import { describe, expect, it } from "vitest";
import { jsonRequest } from "./helpers";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";

// Cada rota limitada tem a sua própria janela em memória (lib/rate-limit.ts)
// — testar aqui, num ficheiro à parte dos testes funcionais de login/reset,
// para não obrigar esses ficheiros a contar quantas chamadas já fizeram
// contra o limite. IPs únicos por teste (x-forwarded-for) para não
// interferirem uns com os outros dentro deste mesmo ficheiro.
function requestFrom(url: string, ip: string, body: unknown) {
  const request = jsonRequest(url, { method: "POST", body });
  request.headers.set("x-forwarded-for", ip);
  return request;
}

describe("Rate limiting", () => {
  it("blocks login after too many attempts from the same IP, within the same window", async () => {
    const ip = "203.0.113.10";
    let lastStatus = 0;
    for (let i = 0; i < 15; i++) {
      const response = await login(requestFrom("http://localhost/api/auth/login", ip, { email: "nobody@example.com", password: "wrong" }));
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(401); // as primeiras 15 ainda passam a validação (e falham por credenciais erradas)

    const blocked = await login(requestFrom("http://localhost/api/auth/login", ip, { email: "nobody@example.com", password: "wrong" }));
    expect(blocked.status).toBe(429);
  });

  it("blocks password-reset requests after too many from the same IP", async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < 5; i++) {
      await requestReset(requestFrom("http://localhost/api/auth/password-reset/request", ip, { email: "nobody@example.com" }));
    }
    const blocked = await requestReset(requestFrom("http://localhost/api/auth/password-reset/request", ip, { email: "nobody@example.com" }));
    expect(blocked.status).toBe(429);
  });

  it("does not rate-limit a different IP calling the same route", async () => {
    const busyIp = "203.0.113.30";
    for (let i = 0; i < 5; i++) {
      await requestReset(requestFrom("http://localhost/api/auth/password-reset/request", busyIp, { email: "nobody@example.com" }));
    }
    const otherIp = await requestReset(requestFrom("http://localhost/api/auth/password-reset/request", "203.0.113.31", { email: "nobody@example.com" }));
    expect(otherIp.status).toBe(200);
  });
});
