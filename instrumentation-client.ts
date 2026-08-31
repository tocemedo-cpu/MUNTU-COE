import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Desligado de propósito: o portal mostra facturas, dados de
  // fornecedores e de candidaturas em ecrã — uma gravação de sessão é
  // exactamente o tipo de dado que não deve sair daqui por omissão.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

// Exigido pelo SDK para instrumentar navegações client-side (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
