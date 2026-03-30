"use client";

import { CommandPalette } from "@/components/ide/CommandPalette";
import Index from "@/features/ide/Index";
import { MobileGatekeeper } from "@/components/ide/MobileGatekeeper";
import { QuickOpen } from "@/components/ide/QuickOpen";
import { SettingsModal } from "@/components/ide/SettingsModal";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import XdrInspector from "@/components/tools/XdrInspector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
// `Index` already imported above; duplicate import removed.

export default function HomePage() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === ","
      ) {
        event.preventDefault();
        setSettingsOpen(true);
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        window.dispatchEvent(new Event("ide:open-search"));
      }

      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
        setSettingsOpen(false);
      }
    };

    const handleToggleCommandPalette = () => {
      setCommandPaletteOpen((prev) => !prev);
    };

    const handleOpenSettings = () => {
      setSettingsOpen(true);
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    window.addEventListener(
      "ide:toggle-command-palette",
      handleToggleCommandPalette,
    );
    window.addEventListener("ide:open-settings", handleOpenSettings);

    return () => {
      window.removeEventListener("keydown", handleGlobalShortcuts);
      window.removeEventListener(
        "ide:toggle-command-palette",
        handleToggleCommandPalette,
      );
      window.removeEventListener("ide:open-settings", handleOpenSettings);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <MobileGatekeeper />
          <XdrInspector />
          <Index />
          <QuickOpen />
          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
          />
          <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
