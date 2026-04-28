import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FileNode, sampleContracts } from "@/lib/sample-contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceRoot {
  /** Unique stable ID for this root */
  id: string;
  /** Display name shown in the explorer header */
  name: string;
  /** File tree for this root */
  files: FileNode[];
  /** Build context / settings isolated per root */
  buildContext: {
    network: string;
    contractId: string | null;
  };
}

export interface ArchivedWorkspaceRoot extends WorkspaceRoot {
  deletedAt: string;
}

export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

interface MultiRootState {
  roots: WorkspaceRoot[];
  trash: ArchivedWorkspaceRoot[];
  /** Add a new root folder */
  addRoot: (name: string, files?: FileNode[]) => string;
  /** Move a root to trash by id */
  removeRoot: (id: string) => void;
  /** Restore a root from trash */
  restoreRoot: (id: string) => void;
  /** Permanently delete a trashed root */
  permanentlyDeleteRoot: (id: string) => void;
  /** Purge roots that exceeded retention window */
  purgeExpiredTrash: () => void;
  /** Reorder roots (drag-and-drop) */
  reorderRoots: (fromIndex: number, toIndex: number) => void;
  /** Update files for a specific root */
  setRootFiles: (id: string, files: FileNode[]) => void;
  /** Update build context for a specific root */
  setRootBuildContext: (
    id: string,
    ctx: Partial<WorkspaceRoot["buildContext"]>
  ) => void;
  /** Rename a root */
  renameRoot: (id: string, name: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idCounter = 0;
const genId = () => `root-${Date.now()}-${++_idCounter}`;

const cloneFiles = (files: FileNode[]): FileNode[] =>
  JSON.parse(JSON.stringify(files));

const DEFAULT_ROOT: WorkspaceRoot = {
  id: "root-default",
  name: "hello_world",
  files: cloneFiles(sampleContracts),
  buildContext: { network: "testnet", contractId: null },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMultiRootStore = create<MultiRootState>()(
  persist(
    (set) => ({
      roots: [DEFAULT_ROOT],
      trash: [],

      addRoot: (name, files = []) => {
        const id = genId();
        const root: WorkspaceRoot = {
          id,
          name: name.trim() || "New Project",
          files: cloneFiles(files),
          buildContext: { network: "testnet", contractId: null },
        };
        set((state) => ({ roots: [...state.roots, root] }));
        return id;
      },

      removeRoot: (id) => {
        set((state) => {
          const removedRoot = state.roots.find((root) => root.id === id);
          if (!removedRoot) {
            return state;
          }

          return {
            roots: state.roots.filter((root) => root.id !== id),
            trash: [
              ...state.trash,
              {
                ...removedRoot,
                deletedAt: new Date().toISOString(),
              },
            ],
          };
        });
      },

      restoreRoot: (id) => {
        set((state) => {
          const item = state.trash.find((root) => root.id === id);
          if (!item) return state;

          const restoredRoot: WorkspaceRoot = {
            id: item.id,
            name: item.name,
            files: item.files,
            buildContext: item.buildContext,
          };

          return {
            roots: state.roots.some((root) => root.id === restoredRoot.id)
              ? state.roots
              : [...state.roots, restoredRoot],
            trash: state.trash.filter((root) => root.id !== id),
          };
        });
      },

      permanentlyDeleteRoot: (id) => {
        set((state) => ({
          trash: state.trash.filter((root) => root.id !== id),
        }));
      },

      purgeExpiredTrash: () => {
        const now = Date.now();
        set((state) => ({
          trash: state.trash.filter((root) => {
            const deletedAtMs = new Date(root.deletedAt).getTime();
            if (Number.isNaN(deletedAtMs)) return false;
            return now - deletedAtMs < TRASH_RETENTION_MS;
          }),
        }));
      },

      reorderRoots: (fromIndex, toIndex) => {
        set((state) => {
          const next = [...state.roots];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { roots: next };
        });
      },

      setRootFiles: (id, files) => {
        set((state) => ({
          roots: state.roots.map((r) =>
            r.id === id ? { ...r, files: cloneFiles(files) } : r
          ),
        }));
      },

      setRootBuildContext: (id, ctx) => {
        set((state) => ({
          roots: state.roots.map((r) =>
            r.id === id
              ? { ...r, buildContext: { ...r.buildContext, ...ctx } }
              : r
          ),
        }));
      },

      renameRoot: (id, name) => {
        set((state) => ({
          roots: state.roots.map((r) =>
            r.id === id ? { ...r, name: name.trim() || r.name } : r
          ),
        }));
      },
    }),
    {
      name: "stellar-suite-multi-root-store",
      partialize: (state) => ({ roots: state.roots, trash: state.trash }),
    }
  )
);
