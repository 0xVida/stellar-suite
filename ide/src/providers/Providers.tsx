"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactNode, useEffect } from "react";
import { registerServiceWorker } from "@/utils/registerServiceWorker";
import { QueryProvider } from "@/providers/QueryProvider";

export function Providers({ children }: { children: ReactNode }) {
  // Register the service worker once on first client-side mount.
  // This must run here (inside a "use client" component) rather than in the
  // Server Component layout.tsx.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <SessionProvider>
      <QueryProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
