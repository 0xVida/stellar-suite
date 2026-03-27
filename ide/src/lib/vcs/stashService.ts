/**
 * stashService.ts
 *
 * Browser-side stash management built on top of isomorphic-git + LightningFS.
 *
 * Because isomorphic-git has no native `git stash` command, we implement the
 * same semantics manually:
 *
 *   push  — snapshot dirty working-tree files into IndexedDB, then restore
 *            each file to its HEAD content (clean working tree).
 *   list  — read all stash entries from IndexedDB.
 *   pop   — apply the top stash entry and remove it (with conflict pre-check).
 *   apply — apply a stash entry by index without removing it.
 *   drop  — delete a stash entry by index without applying it.
 *
 * All operations are fully async and never block the main thread.
 */

import LightningFS from "@isomorphic-git/lightning-fs";
import * as git from "isomorphic-git";
import { get, set, del } from "idb-keyval";

// ── Types ─────────────────────────────────────────────────────────────────

export interface StashEntry {
  /** Unique index — 0 is the most recent (stash@{0}) */
  index: number;
  /** Human-readable message supplied at push time */
  message: string;
  /** ISO-8601 timestamp of when the stash was created */
  timestamp: string;
  /** Snapshot of dirty files: path → content at stash time */
  files: Record<string, string>;
}

export interface StashPushOptions {
  /** Optional description shown in the stash list */
  message?: string;
  /** Current workspace files (path → content) used to detect dirty state */
  workspaceFiles: Record<string, string>;
}

export interface StashApplyResult {
  success: boolean;
  message: string;
  /** Restored file contents keyed by path */
  restoredFiles?: Record<string, string>;
  /** True when the working tree was dirty before the apply/pop */
  hadConflictRisk?: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────

const STASH_IDB_KEY = "stellar-suite-ide-stash-entries";
const FS_NAME = "stellar-suite-ide-repo";
const DIR = "/workspace";

/** Shared FS registry — mirrors the pattern in gitService.ts */
const browserFsRegistry = globalThis as typeof globalThis & {
  __stellarSuiteGitFsRegistry__?: Map<string, LightningFS>;
};

function getFs(): LightningFS {
  if (typeof window === "undefined") {
    throw new Error("stashService is only available in the browser.");
  }
  if (!browserFsRegistry.__stellarSuiteGitFsRegistry__) {
    browserFsRegistry.__stellarSuiteGitFsRegistry__ = new Map();
  }
  const registry = browserFsRegistry.__stellarSuiteGitFsRegistry__;
  if (!registry.has(FS_NAME)) {
    registry.set(FS_NAME, new LightningFS(FS_NAME, { wipe: false }));
  }
  return registry.get(FS_NAME)!;
}

const normalizePath = (p: string) =>
  p.replace(/\\/g, "/").replace(/^\/+/, "");

/** Read all stash entries from IndexedDB (newest first = index 0). */
async function readStashEntries(): Promise<StashEntry[]> {
  return (await get<StashEntry[]>(STASH_IDB_KEY)) ?? [];
}

/** Persist the full stash list to IndexedDB. */
async function writeStashEntries(entries: StashEntry[]): Promise<void> {
  // Re-index so index always matches array position
  const reindexed = entries.map((e, i) => ({ ...e, index: i }));
  await set(STASH_IDB_KEY, reindexed);
}

/**
 * Read the HEAD content for a given path from the isomorphic-git object store.
 * Returns null if the file didn't exist at HEAD.
 */
async function readHeadContent(filePath: string): Promise<string | null> {
  const fs = getFs();
  try {
    const { blob } = await git.readBlob({
      fs,
      dir: DIR,
      oid: "HEAD",
      filepath: normalizePath(filePath),
    });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

/**
 * Collect all files that differ from HEAD in the current working tree.
 * Returns a map of path → current content for every dirty file.
 */
async function collectDirtyFiles(
  workspaceFiles: Record<string, string>
): Promise<Record<string, string>> {
  const dirty: Record<string, string> = {};

  await Promise.all(
    Object.entries(workspaceFiles).map(async ([path, content]) => {
      const headContent = await readHeadContent(path);
      // New files (headContent === null) or modified files are both "dirty"
      if (headContent === null || headContent !== content) {
        dirty[normalizePath(path)] = content;
      }
    })
  );

  return dirty;
}

/**
 * Check whether the working tree has any uncommitted changes.
 * Used as the conflict pre-check before `pop`.
 */
async function hasUncommittedChanges(
  workspaceFiles: Record<string, string>
): Promise<boolean> {
  const dirty = await collectDirtyFiles(workspaceFiles);
  return Object.keys(dirty).length > 0;
}

// ── Public API ────────────────────────────────────────────────────────────

export function createStashService() {
  /**
   * List all stash entries (newest first).
   * Always returns a fresh copy from IndexedDB — safe to call at any time.
   */
  const list = async (): Promise<StashEntry[]> => {
    return readStashEntries();
  };

  /**
   * Push the current dirty working tree onto the stash stack.
   *
   * Equivalent to: git stash push -m "<message>"
   *
   * After a successful push the caller should restore each file in
   * `restoredFiles` to its HEAD content to give the user a clean tree.
   */
  const push = async (
    options: StashPushOptions
  ): Promise<{ success: boolean; message: string; restoredFiles: Record<string, string> }> => {
    const dirty = await collectDirtyFiles(options.workspaceFiles);

    if (Object.keys(dirty).length === 0) {
      return {
        success: false,
        message: "No local changes to stash.",
        restoredFiles: {},
      };
    }

    // Build the stash entry
    const entries = await readStashEntries();
    const label =
      options.message?.trim() ||
      `WIP on workspace (${new Date().toLocaleTimeString()})`;

    const newEntry: StashEntry = {
      index: 0, // will be re-indexed on write
      message: label,
      timestamp: new Date().toISOString(),
      files: dirty,
    };

    // Prepend so index 0 is always the newest
    await writeStashEntries([newEntry, ...entries]);

    // Build the "clean" restore map: HEAD content for each dirty file
    const restoredFiles: Record<string, string> = {};
    await Promise.all(
      Object.keys(dirty).map(async (path) => {
        const headContent = await readHeadContent(path);
        // If the file is brand-new (no HEAD), restore to empty string
        restoredFiles[path] = headContent ?? "";
      })
    );

    const count = Object.keys(dirty).length;
    return {
      success: true,
      message: `Stashed ${count} file${count === 1 ? "" : "s"}: "${label}"`,
      restoredFiles,
    };
  };

  /**
   * Apply a stash entry by index without removing it from the stack.
   *
   * Equivalent to: git stash apply stash@{index}
   */
  const apply = async (
    index: number,
    currentWorkspaceFiles: Record<string, string>
  ): Promise<StashApplyResult> => {
    const entries = await readStashEntries();
    const entry = entries[index];

    if (!entry) {
      return { success: false, message: `No stash entry at index ${index}.` };
    }

    const dirty = await hasUncommittedChanges(currentWorkspaceFiles);

    return {
      success: true,
      message: `Applied stash@{${index}}: "${entry.message}"`,
      restoredFiles: { ...entry.files },
      hadConflictRisk: dirty,
    };
  };

  /**
   * Pop the stash entry at `index` (default 0): apply it and remove it.
   *
   * Equivalent to: git stash pop stash@{index}
   *
   * If the working tree is dirty, `hadConflictRisk` is set to true in the
   * result so the UI can warn the user — but the pop still proceeds only
   * after the caller confirms (the UI layer owns that gate).
   */
  const pop = async (
    currentWorkspaceFiles: Record<string, string>,
    index = 0
  ): Promise<StashApplyResult> => {
    const entries = await readStashEntries();
    const entry = entries[index];

    if (!entry) {
      return { success: false, message: `No stash entry at index ${index}.` };
    }

    const dirty = await hasUncommittedChanges(currentWorkspaceFiles);

    // Remove the entry from the stack
    const nextEntries = entries.filter((_, i) => i !== index);
    await writeStashEntries(nextEntries);

    return {
      success: true,
      message: `Popped stash@{${index}}: "${entry.message}"`,
      restoredFiles: { ...entry.files },
      hadConflictRisk: dirty,
    };
  };

  /**
   * Drop a stash entry by index without applying it.
   *
   * Equivalent to: git stash drop stash@{index}
   */
  const drop = async (
    index: number
  ): Promise<{ success: boolean; message: string }> => {
    const entries = await readStashEntries();
    if (!entries[index]) {
      return { success: false, message: `No stash entry at index ${index}.` };
    }
    const label = entries[index].message;
    await writeStashEntries(entries.filter((_, i) => i !== index));
    return { success: true, message: `Dropped stash@{${index}}: "${label}"` };
  };

  /**
   * Clear the entire stash stack.
   *
   * Equivalent to: git stash clear
   */
  const clear = async (): Promise<void> => {
    await del(STASH_IDB_KEY);
  };

  return { list, push, apply, pop, drop, clear };
}

export const stashService = createStashService();
