/** Origem pública (https://dominio.example) a partir de um pedido recebido
 * pela app — usada para construir links que vão dentro de e-mails
 * (recuperação de password, convites, notificações). `request.url` por si só
 * não chega: atrás do proxy do Render (como a maioria dos PaaS), o Node
 * dentro do container só vê o endereço interno em que está à escuta
 * (ex: http://localhost:10000), nunca o domínio https público que o
 * utilizador visitou — sem isto, os links nos e-mails apontavam para
 * "localhost:10000" mesmo em produção. Mesmo padrão de confiar em
 * cabeçalhos x-forwarded-* já usado em clientIp (lib/rate-limit.ts). */
export function publicOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
