import * as Sentry from "@sentry/nextjs";

// Sem NEXT_PUBLIC_SENTRY_DSN definida, o SDK fica inerte (dsn undefined
// desliga qualquer pedido de rede) — mesmo padrão de BREVO_API_KEY/
// CRON_SECRET/MUNTU_NIF já usado no resto desta app: a funcionalidade
// activa-se sozinha quando a variável existe, sem precisar de mudar
// código nenhum.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
