import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "harn-tee — หารที",
  description: "ช่วยหารบิลที่เราจ่ายกันไปแบบชัดเจนและตรวจสอบได้",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
