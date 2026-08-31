import * as Sentry from "@sentry/nextjs";

// Corre em middleware.ts (runtime Edge) — mesma condição de activação que
// sentry.server.config.ts.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
