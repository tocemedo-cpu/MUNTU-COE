// Envio de e-mail via Brevo (API HTTP simples, sem SDK). Sem BREVO_API_KEY
// e BREVO_FROM_EMAIL definidos, fica em modo de desenvolvimento: regista o
// link nos logs do servidor em vez de falhar — tal como o SSO, só fica
// totalmente funcional quando a plataforma fornece credenciais reais (ver
// README). As duas variáveis são exigidas em conjunto porque, ao contrário
// do Resend, o Brevo não tem um remetente de teste partilhado — só aceita
// enviar a partir de um e-mail que o dono da conta verificou lá, por isso
// não há um valor por omissão sensato para BREVO_FROM_EMAIL.
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    console.warn(
      `[mailer] BREVO_API_KEY/BREVO_FROM_EMAIL não estão definidas — o e-mail de recuperação de acesso para ${email} não foi enviado. Link: ${resetUrl}`
    );
    return;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Muntu COE", email: fromEmail },
      to: [{ email }],
      subject: "Recuperar acesso — Muntu COE",
      htmlContent: `<p>Recebemos um pedido para repor a palavra-passe da sua conta Muntu COE.</p><p><a href="${resetUrl}">Definir nova palavra-passe</a></p><p>Este link expira em 30 minutos. Se não foi você a pedir isto, ignore este e-mail — a sua palavra-passe actual continua válida.</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail via Brevo (${response.status}): ${body}`);
  }
}
