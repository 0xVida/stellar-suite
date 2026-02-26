import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Stellar Suite — Build & Deploy Soroban Contracts in VS Code",
  description:
    "Build, deploy, and simulate Stellar Soroban smart contracts directly from VS Code. The easiest alternative to the Stellar CLI.",
  authors: [{ name: "Stellar Suite" }],
  openGraph: {
    title: "Stellar Suite — Soroban Development in VS Code",
    description:
      "Build, deploy, and simulate Stellar Soroban smart contracts directly from VS Code.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/icon.png", 
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-background">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function() {
  var theme = localStorage.getItem('theme');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (theme === 'dark' || (theme !== 'light' && systemDark)) {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`,
          }}
        />
      </head>
      <body className="bg-background text-foreground min-h-screen">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
