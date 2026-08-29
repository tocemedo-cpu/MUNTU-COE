// Envio de e-mail via Brevo (API HTTP simples, sem SDK). Sem BREVO_API_KEY
// e BREVO_FROM_EMAIL definidos, fica em modo de desenvolvimento: regista o
// link nos logs do servidor em vez de falhar — tal como o SSO, só fica
// totalmente funcional quando a plataforma fornece credenciais reais (ver
// README). As duas variáveis são exigidas em conjunto porque, ao contrário
// do Resend, o Brevo não tem um remetente de teste partilhado — só aceita
// enviar a partir de um e-mail que o dono da conta verificou lá, por isso
// não há um valor por omissão sensato para BREVO_FROM_EMAIL.
async function sendBrevoEmail(params: { to: string; subject: string; html: string; devLogLabel: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    console.warn(
      `[mailer] BREVO_API_KEY/BREVO_FROM_EMAIL não estão definidas — ${params.devLogLabel} para ${params.to} não foi enviado. Conteúdo: ${params.html}`
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
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail via Brevo (${response.status}): ${body}`);
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  await sendBrevoEmail({
    to: email,
    subject: "Recuperar acesso — Muntu COE",
    html: `<p>Recebemos um pedido para repor a palavra-passe da sua conta Muntu COE.</p><p><a href="${resetUrl}">Definir nova palavra-passe</a></p><p>Este link expira em 30 minutos. Se não foi você a pedir isto, ignore este e-mail — a sua palavra-passe actual continua válida.</p>`,
    devLogLabel: "o e-mail de recuperação de acesso",
  });
}

// Confirmação de candidatura (Candidatura -> Documentos -> Avaliação) —
// dá ao candidato o link para acompanhar o estado e anexar documentos,
// já que ainda não tem conta nenhuma para entrar no portal.
export async function sendApplicationReceivedEmail(email: string, applicationId: string, statusUrl: string): Promise<void> {
  await sendBrevoEmail({
    to: email,
    subject: `Candidatura recebida — ${applicationId} — Muntu COE`,
    html: `<p>Recebemos a sua candidatura ao Centro de Excelência Muntu (referência <strong>${applicationId}</strong>).</p><p>Pode acompanhar o estado da candidatura e anexar documentos de suporte aqui: <a href="${statusUrl}">${statusUrl}</a></p><p>Guarde este link — é a única forma de aceder à sua candidatura antes de ela ser homologada.</p>`,
    devLogLabel: "o e-mail de confirmação de candidatura",
  });
}

// Homologação (Aprovada -> Homologação -> Acesso Muntu) — primeiro e-mail
// real de uma conta nova, com o mesmo link de "definir palavra-passe" que
// a recuperação de acesso usa (o token é do mesmo tipo, só muda o texto).
export async function sendWelcomeSetPasswordEmail(email: string, name: string, setPasswordUrl: string): Promise<void> {
  await sendBrevoEmail({
    to: email,
    subject: "A sua candidatura foi homologada — Muntu COE",
    html: `<p>Olá ${name},</p><p>A sua candidatura ao Centro de Excelência Muntu foi homologada e já tem uma conta criada na plataforma.</p><p><a href="${setPasswordUrl}">Defina a sua palavra-passe para aceder ao portal</a></p><p>Este link expira em 7 dias.</p>`,
    devLogLabel: "o e-mail de boas-vindas",
  });
}
