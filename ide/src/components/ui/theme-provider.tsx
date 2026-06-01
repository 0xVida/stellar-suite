"use client";

/**
 * src/components/ui/theme-provider.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised theme provider for the shared UI component library (Issue #822).
 *
 * Wraps next-themes and exposes:
 *   - <ThemeProvider>  — root wrapper; place once in layout.tsx
 *   - <ThemeToggle />  — accessible dropdown that switches between all themes
 *   - useAppTheme()    — hook for reading / setting the current theme
 *
 * Supported themes (mapped to CSS class names in globals.css):
 *   "dark"      — default dark IDE palette
 *   "light"     — light IDE palette
 *   "dark-hc"   — dark high-contrast (WCAG AA)
 *   "light-hc"  — light high-contrast (WCAG AA)
 *   "system"    — follows OS preference
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppTheme = "dark" | "light" | "dark-hc" | "light-hc" | "system";

const THEMES: { value: AppTheme; label: string }[] = [
  { value: "dark",     label: "Dark" },
  { value: "light",    label: "Light" },
  { value: "dark-hc",  label: "Dark (High Contrast)" },
  { value: "light-hc", label: "Light (High Contrast)" },
  { value: "system",   label: "System" },
];

// ── ThemeProvider ─────────────────────────────────────────────────────────────

/**
 * Root theme provider — wrap your root layout once.
 *
 * @example
 * // app/layout.tsx
 * import { ThemeProvider } from "@/components/ui/theme-provider";
 * export default function RootLayout({ children }) {
 *   return (
 *     <html suppressHydrationWarning>
 *       <body>
 *         <ThemeProvider>{children}</ThemeProvider>
 *       </body>
 *     </html>
 *   );
 * }
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      themes={THEMES.map((t) => t.value)}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// ── useAppTheme ───────────────────────────────────────────────────────────────

/**
 * Hook for reading and setting the current app theme.
 * Returns `undefined` on the server / before mount to avoid hydration mismatches.
 */
export function useAppTheme() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return {
    theme: mounted ? (theme as AppTheme | undefined) : undefined,
    resolvedTheme: mounted ? (resolvedTheme as AppTheme | undefined) : undefined,
    systemTheme: mounted ? (systemTheme as AppTheme | undefined) : undefined,
    setTheme: (t: AppTheme) => setTheme(t),
    mounted,
    isDark: mounted && (resolvedTheme === "dark" || resolvedTheme === "dark-hc"),
    isLight: mounted && (resolvedTheme === "light" || resolvedTheme === "light-hc"),
    isHighContrast: mounted && (resolvedTheme === "dark-hc" || resolvedTheme === "light-hc"),
  };
}

// ── ThemeToggle ───────────────────────────────────────────────────────────────

export interface ThemeToggleProps {
  /** Additional class names forwarded to the root <select>. */
  className?: string;
}

/**
 * Accessible theme selector dropdown.
 * Renders a placeholder (visually hidden) until mounted to prevent
 * server/client hydration mismatches.
 *
 * @example
 * import { ThemeToggle } from "@/components/ui/theme-provider";
 * <ThemeToggle className="ml-auto" />
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme, mounted } = useAppTheme();

  if (!mounted) {
    return (
      <select
        aria-label="Select theme"
        disabled
        className={cn(
          "rounded border border-border bg-background px-2 py-1 text-sm text-foreground opacity-0",
          className,
        )}
      >
        <option>Theme</option>
      </select>
    );
  }

  return (
    <select
      aria-label="Select theme"
      value={theme ?? "dark"}
      onChange={(e) => setTheme(e.target.value as AppTheme)}
      className={cn(
        "rounded border border-border bg-background px-2 py-1 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        className,
      )}
    >
      {THEMES.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
