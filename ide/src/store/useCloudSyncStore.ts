"use client";

/**
 * useCloudSyncStore.ts
 *
 * Zustand store for cloud project persistence state.
 *
 * Auto-save is throttled with a 5-second debounce so that rapid edits
 * only produce one network round-trip per burst of typing.
 * The last-saved file hashes are kept in module scope (not persisted) to
 * detect no-op saves and skip unnecessary uploads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  saveProject,
  loadProject,
  type ProjectData,
  type WorkspaceTextFile,
  type TabInfo,
} from "@/lib/cloud/cloudSyncService";
import { buildHashMap } from "@/lib/cloud/fileHash";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CloudSyncStatus =
  | "idle"
  | "saving"
  | "saved"
  | "loading"
  | "conflict"
  | "error";

interface CloudSyncState {
  // Persisted across page reloads
  projectId: string | null;
  projectName: string;
  lastSyncedAt: string | null; // ISO timestamp of last successful sync

  // Transient (reset on mount)
  syncStatus: CloudSyncStatus;
  errorMessage: string | null;
  conflictData: ProjectData | null;
  isRemoteUpdate: boolean; // Distinguish local vs remote updates
  lastTabSyncAt: string | null; // Timestamp of last tab state sync

  // Actions
  setProjectName: (name: string) => void;
  triggerSave: (
    userId: string,
    files: WorkspaceTextFile[],
    network: string,
    openTabs?: TabInfo[],
    activeTabPath?: string[],
  ) => Promise<void>;
  scheduleAutoSave: (
    userId: string,
    files: WorkspaceTextFile[],
    network: string,
    openTabs?: TabInfo[],
    activeTabPath?: string[],
  ) => void;
  loadFromCloud: (projectId: string) => Promise<ProjectData | null>;
  applyRemoteTabState: (openTabs: TabInfo[], activeTabPath: string[]) => void;
  resolveConflict: (choice: "local" | "cloud") => void;
  clearError: () => void;
  setIsRemoteUpdate: (isRemote: boolean) => void;
}

// ── Module-level mutable refs (not serialised to storage) ────────────────────

let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _tabSyncTimer: ReturnType<typeof setTimeout> | null = null;
/** Hash map of the files as of the last successful cloud save. */
let _lastSavedHashes: Record<string, string> = {};
/** Last tab state that was synced to cloud, to avoid sync loops. */
let _lastSyncedTabState: string | null = null;

const AUTO_SAVE_DELAY_MS = 5_000;
const TAB_SYNC_DELAY_MS = 1_000;

// ── Store ─────────────────────────────────────────────────────────────────────

export const useCloudSyncStore = create<CloudSyncState>()(
  persist(
    (set, get) => ({
      // ── Persisted initial state ─────────────────────────────────────────────
      projectId: null,
      projectName: "Untitled Project",
      lastSyncedAt: null,

      // ── Transient initial state ─────────────────────────────────────────────
      syncStatus: "idle",
      errorMessage: null,
      conflictData: null,
      isRemoteUpdate: false,
      lastTabSyncAt: null,

      // ── Actions ─────────────────────────────────────────────────────────────

      setProjectName: (name) => set({ projectName: name }),

      setIsRemoteUpdate: (isRemote) => set({ isRemoteUpdate: isRemote }),

      triggerSave: async (userId, files, network, openTabs, activeTabPath) => {
        if (!userId) return;

        // Skip if nothing has changed since the last save (files or tabs)
        const currentHashes = buildHashMap(files);
        const hasFileChanges = files.some(
          (f) => _lastSavedHashes[f.path] !== currentHashes[f.path],
        );
        const hasFileDeletes = Object.keys(_lastSavedHashes).some(
          (p) => !currentHashes[p],
        );

        const currentTabState = openTabs
          ? JSON.stringify({ openTabs, activeTabPath })
          : null;
        const hasTabChanges = currentTabState !== _lastSyncedTabState;

        if (
          !hasFileChanges &&
          !hasFileDeletes &&
          !hasTabChanges &&
          get().projectId !== null
        ) {
          return;
        }

        set({ syncStatus: "saving", errorMessage: null });

        try {
          const { projectId, projectName, lastSyncedAt } = get();

          const result = await saveProject({
            projectId,
            name: projectName,
            network,
            files,
            fileHashes: currentHashes,
            lastKnownUpdatedAt: lastSyncedAt,
            openTabs,
            activeTabPath,
          });

          if (result.type === "conflict") {
            set({ syncStatus: "conflict", conflictData: result.cloudData });
            return;
          }

          _lastSavedHashes = result.fileHashes;
          if (currentTabState) {
            _lastSyncedTabState = currentTabState;
          }
          set({
            syncStatus: "saved",
            projectId: result.projectId,
            lastSyncedAt: result.updatedAt,
            lastTabSyncAt: result.updatedAt,
            conflictData: null,
          });

          // Log the sync event for verification
          console.log("[CloudSync] State synced at", new Date().toISOString(), {
            openTabs,
            activeTabPath,
            updatedAt: result.updatedAt,
          });

          // Reset the "saved" indicator back to idle after 3 s
          setTimeout(() => {
            if (useCloudSyncStore.getState().syncStatus === "saved") {
              useCloudSyncStore.setState({ syncStatus: "idle" });
            }
          }, 3_000);
        } catch (err) {
          set({
            syncStatus: "error",
            errorMessage: err instanceof Error ? err.message : "Save failed",
          });
        }
      },

      scheduleAutoSave: (userId, files, network, openTabs, activeTabPath) => {
        if (_autoSaveTimer) {
          clearTimeout(_autoSaveTimer);
        }
        _autoSaveTimer = setTimeout(() => {
          _autoSaveTimer = null;
          void get().triggerSave(userId, files, network, openTabs, activeTabPath);
        }, AUTO_SAVE_DELAY_MS);
      },

      scheduleTabSync: (userId, files, network, openTabs, activeTabPath) => {
        if (_tabSyncTimer) {
          clearTimeout(_tabSyncTimer);
        }
        _tabSyncTimer = setTimeout(() => {
          _tabSyncTimer = null;
          void get().triggerSave(userId, files, network, openTabs, activeTabPath);
        }, TAB_SYNC_DELAY_MS);
      },

      loadFromCloud: async (projectId) => {
        set({ syncStatus: "loading", errorMessage: null, isRemoteUpdate: true });
        try {
          const data = await loadProject(projectId);
          if (!data) {
            set({ syncStatus: "error", errorMessage: "Project not found", isRemoteUpdate: false });
            return null;
          }
          _lastSavedHashes = data.fileHashes ?? {};
          _lastSyncedTabState = data.openTabs ? JSON.stringify({ openTabs: data.openTabs, activeTabPath: data.activeTabPath }) : null;
          set({
            syncStatus: "idle",
            projectId: data.id,
            projectName: data.name,
            lastSyncedAt: data.updatedAt,
            lastTabSyncAt: data.updatedAt,
            isRemoteUpdate: false,
          });

          console.log("[CloudSync] Loaded from cloud at", new Date().toISOString(), {
            openTabs: data.openTabs,
            activeTabPath: data.activeTabPath,
          });

          return data;
        } catch (err) {
          set({
            syncStatus: "error",
            errorMessage: err instanceof Error ? err.message : "Load failed",
            isRemoteUpdate: false,
          });
          return null;
        }
      },

      applyRemoteTabState: (openTabs, activeTabPath) => {
        // Skip applying if this is already a remote update to avoid loops
        if (get().isRemoteUpdate) {
          console.log("[CloudSync] Skipping applyRemoteTabState - already remote update");
          return;
        }
        
        const state = JSON.stringify({ openTabs, activeTabPath });
        _lastSyncedTabState = state;
        set({ lastTabSyncAt: new Date().toISOString(), isRemoteUpdate: false });
        
        console.log("[CloudSync] Applied remote tab state at", new Date().toISOString(), {
          openTabs,
          activeTabPath,
        });
      },

      resolveConflict: (choice) => {
        if (choice === "local") {
          // User keeps local — clear conflict state and allow a forced save
          _lastSavedHashes = {};
          _lastSyncedTabState = null;
          set({ syncStatus: "idle", conflictData: null });
        } else {
          // "cloud" branch is handled by the UI calling loadFromCloud after
          // applying the conflictData to the workspace store
          set({ syncStatus: "idle", conflictData: null });
        }
      },

      clearError: () => set({ syncStatus: "idle", errorMessage: null }),
    }),
    {
      name: "stellar-suite-cloud-sync",
      // Only persist the IDs and timestamps; status is always transient
      partialize: (state) => ({
        projectId: state.projectId,
        projectName: state.projectName,
        lastSyncedAt: state.lastSyncedAt,
        lastTabSyncAt: state.lastTabSyncAt,
      }),
    },
  ),
);
