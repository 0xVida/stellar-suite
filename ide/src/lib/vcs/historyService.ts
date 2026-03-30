/**
 * historyService.ts
 *
 * Reads the local isomorphic-git commit log and returns a structured list
 * of up to MAX_COMMITS commits with parent relationships, author info,
 * timestamps, and changed-file lists.
 *
 * All operations are fully async and read-only — zero risk of corrupting
 * the repository state.
 */

import LightningFS from "@isomorphic-git/lightning-fs";
import * as git from "isomorphic-git";

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_COMMITS = 50;
const FS_NAME = "stellar-suite-ide-repo";
const DIR = "/workspace";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CommitNode {
  /** Full 40-char SHA */
  oid: string;
  /** Short 7-char SHA for display */
  shortOid: string;
  /** Parent SHAs (0 = root, 1 = normal, 2 = merge commit) */
  parents: string[];
  author: string;
  /** Unix epoch seconds */
  timestamp: number;
  /** Formatted date string */
  date: string;
  subject: string;
  /** Files changed in this commit (path → status) */
  changedFiles: ChangedFile[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted";
}

// ── FS registry (mirrors gitService.ts pattern) ───────────────────────────

const browserFsRegistry = globalThis as typeof globalThis & {
  __stellarSuiteGitFsRegistry__?: Map<string, LightningFS>;
};

function getFs(): LightningFS {
  if (typeof window === "undefined") {
    throw new Error("historyService is only available in the browser.");
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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Compute the list of files changed between two tree SHAs.
 * Falls back to an empty list if either tree is unavailable.
 */
async function diffTrees(
  fs: LightningFS,
  oidA: string | null,
  oidB: string,
): Promise<ChangedFile[]> {
  try {
    // If there's no parent (initial commit), walk the new tree and mark all files as added
    if (!oidA) {
      const results = await git.walk({
        fs,
        dir: DIR,
        trees: [git.TREE({ ref: oidB })],
        map: async (filepath, [b]) => {
          if (filepath === ".") return null;
          const bType = await b?.type();
          if (bType === "tree") return null;
          return { path: filepath, status: "added" as const };
        },
      });

      return (results as (ChangedFile | null)[]).filter(
        (r): r is ChangedFile => r !== null,
      );
    }

    const results = await git.walk({
      fs,
      dir: DIR,
      trees: [git.TREE({ ref: oidA }), git.TREE({ ref: oidB })],
      map: async (filepath, [a, b]) => {
        // Skip directories
        if (filepath === ".") return null;
        const aType = await a?.type();
        const bType = await b?.type();
        if (aType === "tree" || bType === "tree") return null;

        const aOid = await a?.oid();
        const bOid = await b?.oid();

        if (!aOid && bOid) return { path: filepath, status: "added" as const };
        if (aOid && !bOid)
          return { path: filepath, status: "deleted" as const };
        if (aOid !== bOid)
          return { path: filepath, status: "modified" as const };
        return null;
      },
    });

    return (results as (ChangedFile | null)[]).filter(
      (r): r is ChangedFile => r !== null,
    );
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function fetchHistory(): Promise<CommitNode[]> {
  const fs = getFs();

  // Verify the repo exists before walking
  try {
    await git.currentBranch({ fs, dir: DIR });
  } catch {
    return [];
  }

  // Walk the commit graph from HEAD, capped at MAX_COMMITS
  let rawCommits: git.ReadCommitResult[] = [];
  try {
    rawCommits = await git.log({ fs, dir: DIR, depth: MAX_COMMITS });
  } catch {
    return [];
  }

  // Build CommitNode list with changed-file diffs
  const nodes: CommitNode[] = [];

  for (let i = 0; i < rawCommits.length; i++) {
    const { oid, commit } = rawCommits[i];
    const parentOid = rawCommits[i + 1]?.oid ?? null;

    const changedFiles = await diffTrees(fs, parentOid, oid);

    nodes.push({
      oid,
      shortOid: oid.slice(0, 7),
      parents: commit.parent,
      author: commit.author.name,
      timestamp: commit.author.timestamp,
      date: formatDate(commit.author.timestamp),
      subject: commit.message.split("\n")[0].trim(),
      changedFiles,
    });
  }

  return nodes;
}
