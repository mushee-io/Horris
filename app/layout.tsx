import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Horis — AI Execution on Celo",
  description: "AI-powered DeFi execution with policy-enforced risk controls on Celo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
