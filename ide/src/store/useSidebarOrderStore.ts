/**
 * useSidebarOrderStore.ts
 * Persisted store for customizable sidebar icon order — Issue #816
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ActivityTab } from "@/components/layout/ActivityBar";

const DEFAULT_ORDER: ActivityTab[] = [
  "explorer",
  "git",
  "search",
  "deployments",
  "identities",
  "security",
  "tests",
  "network",
];

interface SidebarOrderState {
  order: ActivityTab[];
  setOrder: (order: ActivityTab[]) => void;
  moveTab: (fromIndex: number, toIndex: number) => void;
  resetOrder: () => void;
}

export const useSidebarOrderStore = create<SidebarOrderState>()(
  persist(
    (set) => ({
      order: DEFAULT_ORDER,

      setOrder: (order) => set({ order }),

      moveTab: (fromIndex, toIndex) =>
        set((state) => {
          const next = [...state.order];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { order: next };
        }),

      resetOrder: () => set({ order: DEFAULT_ORDER }),
    }),
    {
      name: "stellar-suite:sidebar-order",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
    }
  )
);
