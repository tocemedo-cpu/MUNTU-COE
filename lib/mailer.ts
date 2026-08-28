// Envio de e-mail via Resend (API HTTP simples, sem SDK). Sem
// RESEND_API_KEY definido, fica em modo de desenvolvimento: regista o link
// nos logs do servidor em vez de falhar — tal como o SSO, só fica
// totalmente funcional quando a empresa/plataforma fornece credenciais
// reais (ver README).
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[mailer] RESEND_API_KEY não está definida — o e-mail de recuperação de acesso para ${email} não foi enviado. Link: ${resetUrl}`
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Sem RESEND_FROM_EMAIL definido, usa o remetente de teste partilhado
      // do Resend — funciona sem verificar domínio nenhum, mas só entrega
      // ao e-mail da própria conta Resend. Defina RESEND_FROM_EMAIL com um
      // endereço num domínio verificado (Resend → Domains) para enviar a
      // destinatários reais.
      from: process.env.RESEND_FROM_EMAIL || "Muntu COE <onboarding@resend.dev>",
      to: email,
      subject: "Recuperar acesso — Muntu COE",
      html: `<p>Recebemos um pedido para repor a palavra-passe da sua conta Muntu COE.</p><p><a href="${resetUrl}">Definir nova palavra-passe</a></p><p>Este link expira em 30 minutos. Se não foi você a pedir isto, ignore este e-mail — a sua palavra-passe actual continua válida.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail via Resend (${response.status}): ${body}`);
  }
}
