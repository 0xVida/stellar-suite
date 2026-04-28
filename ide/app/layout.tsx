import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Soroban IDE - Stellar Smart Contract Development",
  description: "Browser-based IDE for developing, compiling, and deploying Stellar Soroban smart contracts",
  openGraph: {
    title: "Soroban IDE",
    description: "Browser-based IDE for Stellar Soroban smart contracts",
    type: "website",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/pwa-192x192.png",
  },
};

import { Providers } from "@/providers/Providers";
import { ErrorBoundary } from "@/components/ide/ErrorBoundary";
import { AppStatusProvider } from "@/components/providers/AppStatusProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:p-4 focus:bg-background focus:text-foreground"
        >
          Skip to main content
        </a>
        <Providers>
          <ErrorBoundary>
            <AppStatusProvider>
              {children}
            </AppStatusProvider>
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
