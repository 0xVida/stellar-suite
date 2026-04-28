"use client";

/**
 * theme-provider.tsx
 *
 * Wraps next-themes ThemeProvider and exposes a useTheme hook.
 * Supports four themes:
 *   - "dark"           — default dark IDE theme
 *   - "light"          — light theme
 *   - "dark-hc"        — high-contrast dark (WCAG AA 4.5:1 minimum)
 *   - "light-hc"       — high-contrast light (WCAG AA 4.5:1 minimum)
 *   - "system"         — follows OS preference
 *
 * Usage:
 *   Wrap your root layout with <ThemeProvider>.
 *   Use <ThemeToggle /> anywhere to switch themes.
 */

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

export type AppTheme = "dark" | "light" | "dark-hc" | "light-hc" | "system";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      themes={["dark", "light", "dark-hc", "light-hc", "system"]}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────

const THEMES: { value: AppTheme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "dark-hc", label: "Dark (High Contrast)" },
  { value: "light-hc", label: "Light (High Contrast)" },
  { value: "system", label: "System" },
];

/**
 * A simple accessible theme switcher <select>.
 * Drop this anywhere in the UI — settings panel, toolbar, etc.
 */
export function ThemeToggle() {
  // Lazy import to avoid SSR issues
  const { useTheme } = require("next-themes") as typeof import("next-themes");
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Avoid hydration mismatch — render a placeholder with same dimensions
    return (
      <select
        aria-label="Select theme"
        disabled
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground opacity-0"
      >
        <option>Theme</option>
      </select>
    );
  }

  return (
    <select
      aria-label="Select theme"
      value={theme ?? resolvedTheme ?? "dark"}
      onChange={(e) => setTheme(e.target.value as AppTheme)}
      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {THEMES.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
