import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muntu COE — One-stop-shop P2P",
  description:
    "Centro de Excelência angolano para procurement, accounts payable, compliance, conteúdo local e execução P2P ponta-a-ponta.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-AO">
      <body className="antialiased">{children}</body>
    </html>
  );
}
