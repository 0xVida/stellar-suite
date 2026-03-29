"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useTerminalStore } from "@/store/useTerminalStore";

/**
 * useTerminalBridge
 *
 * Bridges the existing workspaceStore terminal output into the xterm.js
 * instance via useTerminalStore.writeToTerminal.
 *
 * How it works:
 *   - Watches `terminalOutput` in workspaceStore (the raw accumulated string)
 *   - On each change, writes only the *diff* (new characters appended) to xterm
 *     so we don't re-render the entire history on every keystroke
 *
 * Mount this hook once inside the IDE root (Index.tsx or a layout component).
 */
export function useTerminalBridge() {
  const terminalOutput = useWorkspaceStore((s) => s.terminalOutput);
  const writeToTerminal = useTerminalStore((s) => s.writeToTerminal);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    const prev = prevLengthRef.current;
    const current = terminalOutput ?? "";

    if (current.length > prev) {
      // Only write the newly appended slice
      const newChunk = current.slice(prev);
      writeToTerminal(newChunk);
      prevLengthRef.current = current.length;
    } else if (current.length === 0 && prev > 0) {
      // setTerminalOutput("") was called — clear signal handled by Terminal.tsx
      prevLengthRef.current = 0;
    }
  }, [terminalOutput, writeToTerminal]);
}