import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Futuristic System — Control Centre",
  description: "Online control centre for Futuristic System platform",
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
