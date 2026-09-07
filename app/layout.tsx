import type { Metadata } from "next";
import "./globals.css";
import "./routes.css";

export const metadata: Metadata = {
  title: "Horris — Autonomous Execution Infrastructure",
  description: "AI-native execution and risk infrastructure for policy-checked onchain actions on Celo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
