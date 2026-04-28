"use client";

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalStore } from "@/store/useTerminalStore";
import { useUserSettingsStore, TERMINAL_THEMES } from "@/store/useUserSettingsStore";

/**
 * TerminalPane
 *
 * Mounts an xterm.js instance into the bottom console pane.
 * - Interprets ANSI escape codes from cargo build / test output
 * - Resizes via FitAddon whenever the parent pane resizes
 * - Keyboard input is disabled (stdout-only; interactive shell not implemented)
 * - Exposes writeToTerminal via useTerminalStore
 */
export function TerminalPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const { pendingLines, clearPending, setWriter } = useTerminalStore();
  const { terminalTheme, terminalFontFamily, terminalFontSize } = useUserSettingsStore();

  // ── Boot xterm once on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: TERMINAL_THEMES[terminalTheme],
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      lineHeight: 1.5,
      letterSpacing: 0,
      scrollback: 5000,
      // Disable all keyboard input — stdout-only terminal
      disableStdin: true,
      cursorBlink: false,
      allowTransparency: false,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Initial fit — defer one frame so the container has its final size
    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch (_) { /* ignore during SSR hydration */ }
    });

    xtermRef.current   = term;
    fitAddonRef.current = fitAddon;

    // Expose writer to the store
    setWriter((data: string) => term.write(data));

    return () => {
      setWriter(null);
      term.dispose();
      xtermRef.current    = null;
      fitAddonRef.current = null;
    };
  }, [setWriter]);

  // ── Update terminal settings when they change ──────────────────────
  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = TERMINAL_THEMES[terminalTheme];
    xtermRef.current.options.fontFamily = terminalFontFamily;
    xtermRef.current.options.fontSize = terminalFontSize;
    // Refresh the terminal to apply changes
    xtermRef.current.refresh(0, xtermRef.current.rows - 1);
  }, [terminalTheme, terminalFontFamily, terminalFontSize]);

  // ── Resize observer → fitAddon.fit() ────────────────────────────────
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current) return;
    try { fitAddonRef.current.fit(); } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    resizeObserverRef.current = ro;

    // Also handle window resize as a fallback
    window.addEventListener("resize", handleResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", handleResize);
      resizeObserverRef.current = null;
    };
  }, [handleResize]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-[#0d1117]"
      aria-label="Terminal output"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    />
  );
}