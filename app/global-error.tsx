"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Substitui o root layout inteiro quando um erro escapa de todos os error
// boundaries normais — por isso tem de trazer o seu próprio <html>/<body>.
// Sem NEXT_PUBLIC_SENTRY_DSN definida, captureException não faz nada (o
// SDK está inerte — ver sentry.server.config.ts).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-AO">
      <body className="antialiased">
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Ocorreu um erro inesperado</h1>
            <p style={{ color: "#6b6259", marginBottom: 16 }}>A equipa Muntu já foi notificada. Tente recarregar a página.</p>
            <button
              onClick={reset}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d9d2c4", background: "#fff", cursor: "pointer" }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
