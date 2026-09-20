import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Textabana — Language & Interop Specification",
  description:
    "Textabana Language & Interop draft 0.7: a formal editor parser, typed IR, local recovery, open intervals, typed channels, anchors and post-commit adapters.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
