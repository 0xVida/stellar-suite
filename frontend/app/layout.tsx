import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { WebVitals } from "@/components/WebVitals";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stellar Suite - Smart Contract Development Toolkit for Stellar",
  description:
    "Build, deploy, and manage Soroban smart contracts on Stellar — all from VS Code. One-click builds, interactive simulation, signing workflows, and 8 production-ready templates.",
  keywords: [
    "stellar",
    "soroban",
    "smart contracts",
    "blockchain",
    "rust",
    "VS Code extension",
    "developer tools",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
        <FeedbackWidget />
        <WebVitals />
      </body>
    </html>
  );
}
