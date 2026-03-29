import { create } from "zustand";

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

  /** Called by TerminalPane to register the xterm write function */
  setWriter: (fn: ((data: string) => void) | null) => void;

  /** Called by TerminalPane after draining pendingLines */
  clearPending: () => void;

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

  setWriter: (fn) => set({ writer: fn }),

  clearPending: () => set({ pendingLines: [] }),

  writeToTerminal: (data: string) => {
    const { writer } = get();
    if (writer) {
      writer(data);
    } else {
      // Buffer until the terminal mounts
      set((state) => ({ pendingLines: [...state.pendingLines, data] }));
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