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

interface MultiRootState {
  roots: WorkspaceRoot[];
  /** Add a new root folder */
  addRoot: (name: string, files?: FileNode[]) => string;
  /** Remove a root by id */
  removeRoot: (id: string) => void;
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
    (set, get) => ({
      roots: [DEFAULT_ROOT],

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
        set((state) => ({
          roots:
            state.roots.length > 1
              ? state.roots.filter((r) => r.id !== id)
              : state.roots, // always keep at least one root
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
      partialize: (state) => ({ roots: state.roots }),
    }
  )
);
