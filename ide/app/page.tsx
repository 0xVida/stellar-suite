"use client";

import { CommandPalette } from "@/components/ide/CommandPalette";
import dynamic from "next/dynamic";
const Index = dynamic(() => import("@/features/ide/Index"), { ssr: false });
import { MobileGatekeeper } from "@/components/ide/MobileGatekeeper";
import { QuickOpen } from "@/components/ide/QuickOpen";
import { SettingsModal } from "@/components/ide/SettingsModal";
import { ReleaseNotes } from "@/components/modals/ReleaseNotes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  if (!isMounted) return null;

  return (
    <>
      <Toaster />
      <Sonner />
      <MobileGatekeeper />
      <Index />
      <QuickOpen />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ReleaseNotes />
    </>
  );
}
