import type { Metadata } from "next";
import HorrisAiDock from "../components/HorrisAiDock";
import "./globals.css";

export const metadata: Metadata = {
  title: "Horris — AI Execution on Celo",
  description: "AI-powered DeFi execution with policy-enforced risk controls on Celo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<HorrisAiDock /></body>
    </html>
  );
}
