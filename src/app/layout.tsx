import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Futuristic System — AI Control Centre",
    template: "%s · Futuristic System",
  },
  description: "A private AI orchestration control centre for model providers, validated tools, persistent memory and trusted devices.",
  applicationName: "Futuristic System",
  themeColor: "#070b12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
