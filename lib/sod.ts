/** Segregation of Duties / princípio 4-eyes — guarda "mesmo-actor": nos
 * pontos que já têm um passo anterior claramente distinto (rever
 * candidatura -> homologar; validar factura -> libertar pagamento; dono do
 * pedido -> quem aprova/decide o override de risco), a mesma pessoa não
 * pode ser as duas partes. Não é uma fila de aprovação formal — só impede
 * que o mesmo utilizador feche o círculo sozinho nesses pontos. */
export function assertDifferentActor(
  currentUserId: number,
  priorActorUserId: number | null | undefined,
  message: string
): Response | null {
  if (priorActorUserId != null && priorActorUserId === currentUserId) {
    return Response.json({ error: message }, { status: 409 });
  }
  return null;
}
