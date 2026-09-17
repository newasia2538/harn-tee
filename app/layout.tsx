import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "harn-tee — หารที",
  description: "ช่วยหารบิลที่เราจ่ายกันไปแบบชัดเจนและตรวจสอบได้",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/harn-tee-icon.png",
    shortcut: "/harn-tee-icon.png",
    apple: "/harn-tee-icon.png",
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
