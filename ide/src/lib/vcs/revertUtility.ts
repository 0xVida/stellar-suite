/**
 * revertUtility.ts
 *
 * Selective file-level revert utilities.
 * Supports reverting a file to HEAD or to any prior committed version.
 *
 * All reads are non-destructive; writes only happen when the caller
 * explicitly confirms the revert via the returned content.
 */

import LightningFS from "@isomorphic-git/lightning-fs";
import * as git from "isomorphic-git";
import { fetchHistory } from "./historyService";

// ── Constants ──────────────────────────────────────────────────────────────

const FS_NAME = "stellar-suite-ide-repo";
const DIR = "/workspace";

// ── FS registry (mirrors gitService.ts / historyService.ts pattern) ────────

const browserFsRegistry = globalThis as typeof globalThis & {
  __stellarSuiteGitFsRegistry__?: Map<string, LightningFS>;
};

function getFs(): LightningFS {
  if (typeof window === "undefined") {
    throw new Error("revertUtility is only available in the browser.");
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

// ── Public types ───────────────────────────────────────────────────────────

export interface DiffLine {
  /** "removed" = in current but not in target (red) */
  type: "added" | "removed" | "unchanged";
  content: string;
}

export interface RevertTarget {
  /** Full 40-char SHA */
  oid: string;
  /** Short 7-char display SHA */
  shortOid: string;
  /** First line of commit message */
  message: string;
  author: string;
  date: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Core functions ─────────────────────────────────────────────────────────

/**
 * Read the content of a file as it existed at the given commit OID.
 * Returns null if the file did not exist in that commit.
 */
export async function readFileAtCommit(
  filepath: string,
  commitOid: string,
): Promise<string | null> {
  const fs = getFs();
  // Normalize: strip leading slashes, keep relative to /workspace
  const normalizedPath = filepath.replace(/\\/g, "/").replace(/^\/+/, "");

  try {
    const { blob } = await git.readBlob({
      fs,
      dir: DIR,
      oid: commitOid,
      filepath: normalizedPath,
    });
    return new TextDecoder().decode(blob);
  } catch {
    // File did not exist at this commit (deleted, renamed, or pre-creation)
    return null;
  }
}

/**
 * Returns the current HEAD commit as a RevertTarget.
 * Returns null if the repository is not initialized or has no commits.
 */
export async function getHeadCommit(): Promise<RevertTarget | null> {
  const fs = getFs();
  try {
    const oid = await git.resolveRef({ fs, dir: DIR, ref: "HEAD" });
    const { commit } = await git.readCommit({ fs, dir: DIR, oid });
    return {
      oid,
      shortOid: oid.slice(0, 7),
      message: commit.message.split("\n")[0].trim(),
      author: commit.author.name,
      date: formatDate(commit.author.timestamp),
    };
  } catch {
    return null;
  }
}

/**
 * Returns the list of commits (most recent first) that touched the given file.
 * Uses the full commit history from historyService and filters by changedFiles.
 */
export async function fetchCommitsForFile(filepath: string): Promise<RevertTarget[]> {
  const normalizedPath = filepath.replace(/\\/g, "/").replace(/^\/+/, "");
  try {
    const history = await fetchHistory();
    return history
      .filter((commit) =>
        commit.changedFiles.some((f) => f.path === normalizedPath),
      )
      .map((commit) => ({
        oid: commit.oid,
        shortOid: commit.shortOid,
        message: commit.subject,
        author: commit.author,
        date: commit.date,
      }));
  } catch {
    return [];
  }
}

// ── Diff computation ───────────────────────────────────────────────────────

/**
 * Compute a line-level diff from `fromContent` to `toContent`
 * using an LCS (Longest Common Subsequence) algorithm.
 *
 * - "removed" lines appear in fromContent but not in the common subsequence
 *   (i.e. they exist currently but will be gone after revert).
 * - "added" lines appear in toContent but not in the common subsequence
 *   (i.e. they will be restored by the revert).
 * - "unchanged" lines are shared between both versions.
 */
export function computeDiff(fromContent: string, toContent: string): DiffLine[] {
  const a = fromContent.split("\n");
  const b = toContent.split("\n");
  const m = a.length;
  const n = b.length;

  // Build the DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff (iterative to avoid stack overflow on large files)
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "unchanged", content: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", content: b[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", content: a[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

/**
 * Collapse a full diff to only changed regions plus N lines of context.
 * Inserts a sentinel "..." unchanged line between non-adjacent regions.
 */
export function buildContextualDiff(
  diff: DiffLine[],
  contextLines = 3,
): DiffLine[] {
  if (diff.length === 0) return [];

  const changedIndices = diff
    .map((line, idx) => (line.type !== "unchanged" ? idx : -1))
    .filter((idx) => idx !== -1);

  if (changedIndices.length === 0) {
    // Files are identical
    return [];
  }

  const visible = new Set<number>();
  for (const idx of changedIndices) {
    for (
      let k = Math.max(0, idx - contextLines);
      k <= Math.min(diff.length - 1, idx + contextLines);
      k++
    ) {
      visible.add(k);
    }
  }

  const sorted = Array.from(visible).sort((a, b) => a - b);
  const result: DiffLine[] = [];
  let lastIdx = -2;

  for (const idx of sorted) {
    if (lastIdx !== -2 && idx > lastIdx + 1) {
      result.push({ type: "unchanged", content: "···" });
    }
    result.push(diff[idx]);
    lastIdx = idx;
  }

  return result;
}
