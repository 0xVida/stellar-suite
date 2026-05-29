/**
 * Pluggable session storage. The browser default writes to localStorage
 * under a single key, but tests and SSR contexts can inject the
 * `memorySessionStorage()` factory to keep state isolated.
 */

import type { SessionStorage, StoredSession } from "./types";

const DEFAULT_KEY = "stellar-kit:wc-session";

/** Storage backed by `localStorage`. Safe to construct on the server: all
 *  methods short-circuit when `window`/`localStorage` is unavailable. */
export function browserSessionStorage(key: string = DEFAULT_KEY): SessionStorage {
  const getStore = (): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };

  return {
    read(): StoredSession | null {
      const store = getStore();
      if (!store) return null;
      const raw = store.getItem(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as StoredSession;
        if (
          parsed &&
          typeof parsed.topic === "string" &&
          typeof parsed.savedAt === "number"
        ) {
          return parsed;
        }
        return null;
      } catch {
        return null;
      }
    },
    write(value: StoredSession): void {
      const store = getStore();
      if (!store) return;
      store.setItem(key, JSON.stringify(value));
    },
    clear(): void {
      const store = getStore();
      if (!store) return;
      store.removeItem(key);
    },
  };
}

/** In-memory storage; useful for tests and SSR. */
export function memorySessionStorage(): SessionStorage {
  let value: StoredSession | null = null;
  return {
    read: () => value,
    write: (v) => {
      value = v;
    },
    clear: () => {
      value = null;
    },
  };
}
