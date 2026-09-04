import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Textabana — Semantic text runtime",
  description:
    "Normativ specifikation och körbar playground för block, intervall, inheritance och lättviktig semantisk text.",
  icons: {
    icon: "/favicon-textabana.svg",
    shortcut: "/favicon-textabana.svg",
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
