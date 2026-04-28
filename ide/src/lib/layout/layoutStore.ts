import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SidebarTab } from "@/store/workspaceStore";

export interface LayoutSnapshot {
  id: string;
  name: string;
  showExplorer: boolean;
  showPanel: boolean;
  leftSidebarTab: SidebarTab;
  createdAt: number;
  isDefault?: boolean;
}

interface LayoutStoreState {
  snapshots: LayoutSnapshot[];
  activeSnapshotId: string | null;

  saveSnapshot: (
    name: string,
    showExplorer: boolean,
    showPanel: boolean,
    leftSidebarTab: SidebarTab,
  ) => LayoutSnapshot;
  deleteSnapshot: (id: string) => void;
  setActiveSnapshotId: (id: string | null) => void;
}

const DEFAULT_SNAPSHOTS: LayoutSnapshot[] = [
  {
    id: "minimalist",
    name: "Minimalist",
    showExplorer: false,
    showPanel: false,
    leftSidebarTab: "explorer",
    createdAt: 0,
    isDefault: true,
  },
  {
    id: "full",
    name: "Full",
    showExplorer: true,
    showPanel: true,
    leftSidebarTab: "explorer",
    createdAt: 0,
    isDefault: true,
  },
];

export const useLayoutStore = create<LayoutStoreState>()(
  persist(
    (set, get) => ({
      snapshots: DEFAULT_SNAPSHOTS,
      activeSnapshotId: null,

      saveSnapshot: (name, showExplorer, showPanel, leftSidebarTab) => {
        const snapshot: LayoutSnapshot = {
          id: `layout-${Date.now()}`,
          name,
          showExplorer,
          showPanel,
          leftSidebarTab,
          createdAt: Date.now(),
        };
        set((state) => ({ snapshots: [...state.snapshots, snapshot] }));
        return snapshot;
      },

      deleteSnapshot: (id) => {
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.id !== id || s.isDefault),
          activeSnapshotId:
            state.activeSnapshotId === id ? null : state.activeSnapshotId,
        }));
      },

      setActiveSnapshotId: (id) => set({ activeSnapshotId: id }),
    }),
    {
      name: "stellar-layout-snapshots",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        snapshots: state.snapshots,
        activeSnapshotId: state.activeSnapshotId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<LayoutStoreState>;
        const saved = persistedState.snapshots ?? [];
        // Ensure defaults are always present, merge with saved user snapshots
        const defaultIds = new Set(DEFAULT_SNAPSHOTS.map((s) => s.id));
        const userSnapshots = saved.filter((s) => !defaultIds.has(s.id));
        return {
          ...current,
          snapshots: [...DEFAULT_SNAPSHOTS, ...userSnapshots],
          activeSnapshotId: persistedState.activeSnapshotId ?? null,
        };
      },
    },
  ),
);
