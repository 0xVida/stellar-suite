import { create } from "zustand";
import { redactText } from "@/components/ide/LogRedactor";

/**
 * useTerminalStore
 *
 * Global store for the xterm.js terminal pane.
 *
 * Flow:
 *   1. Any part of the app calls `writeToTerminal(data)`.
 *   2. If the xterm instance is mounted, the writer function is called directly.
 *   3. If not yet mounted (SSR / lazy load), data is buffered in `pendingLines`
 *      and drained by TerminalPane on mount.
 */

interface TerminalStore {
  /** Raw xterm write function — set by TerminalPane on mount, null before */
  writer: ((data: string) => void) | null;

  /** Lines buffered before the terminal mounted */
  pendingLines: string[];

  /**
   * When true, every write is passed through the redaction filter before
   * reaching xterm. Kept on the store (rather than React context) so non-React
   * callers like `writeToTerminal` can read it without prop-drilling.
   */
  redactionEnabled: boolean;

  /** Called by TerminalPane to register the xterm write function */
  setWriter: (fn: ((data: string) => void) | null) => void;

  /** Called by TerminalPane after draining pendingLines */
  clearPending: () => void;

  /** Toggle terminal-side redaction (typically wired to the global redaction mode). */
  setRedactionEnabled: (enabled: boolean) => void;

  /**
   * Public API — call this from anywhere in the app to write to the terminal.
   * Accepts raw strings including ANSI escape sequences.
   */
  writeToTerminal: (data: string) => void;

  /** Clears the visible terminal screen */
  clearTerminal: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  writer: null,
  pendingLines: [],
  redactionEnabled: true,

  setWriter: (fn) => set({ writer: fn }),

  clearPending: () => set({ pendingLines: [] }),

  setRedactionEnabled: (enabled) => set({ redactionEnabled: enabled }),

  writeToTerminal: (data: string) => {
    const { writer, redactionEnabled } = get();
    const payload = redactionEnabled ? redactText(data) : data;
    if (writer) {
      writer(payload);
    } else {
      // Buffer until the terminal mounts. We store the post-redaction string
      // so a screenshot of the terminal while it boots can't leak secrets that
      // arrived in the buffered chunk.
      set((state) => ({ pendingLines: [...state.pendingLines, payload] }));
    }
  },

  clearTerminal: () => {
    const { writer } = get();
    if (writer) {
      // ANSI clear screen + move cursor to top-left
      writer("\x1b[2J\x1b[H");
    } else {
      set({ pendingLines: [] });
    }
  },
}));

/**
 * Convenience accessor — use outside React components.
 *
 * @example
 * import { writeToTerminal } from "@/store/useTerminalStore";
 * writeToTerminal("\x1b[32m✓ Done\x1b[0m\r\n");
 */
export const writeToTerminal = (data: string) =>
  useTerminalStore.getState().writeToTerminal(data);

export const clearTerminal = () =>
  useTerminalStore.getState().clearTerminal();