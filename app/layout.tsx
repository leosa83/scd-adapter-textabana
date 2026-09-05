import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Textabana — Language & Interop Specification",
  description:
    "Textabana Language & Interop draft 0.4: normativ semantik för text, IR, öppna intervall, typade kanaler, anchors, notebooks, data och AI/ML-adaptrar.",
  icons: {
    icon: "/favicon-textabana.svg",
    shortcut: "/favicon-textabana.svg",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className="antialiased">{children}</body>
    </html>
  );
}
