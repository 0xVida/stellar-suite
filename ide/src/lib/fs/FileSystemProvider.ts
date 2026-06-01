/**
 * Issue #882 — Abstract File System Operations to an Adaptable Interface.
 *
 * The IDE historically reached for browser storage APIs (localStorage /
 * IndexedDB) directly from feature code, coupling the workspace to a single
 * persistence backend. This module defines a single `FileSystemProvider`
 * interface that all storage targets implement, so core operations compile
 * against the abstraction rather than a concrete backend.
 *
 * Adapters (see ./adapters):
 *  - BrowserFileSystemProvider  — IndexedDB-backed, for in-browser workspaces.
 *  - LocalFileSystemProvider    — Node `fs` rooted at a directory (desktop/server).
 *  - GitHubFileSystemProvider   — remote GitHub repository via the REST API.
 *
 * All paths are POSIX-style, forward-slash separated, and normalised relative
 * to the provider root. A leading slash is optional and treated the same as
 * none ("/a/b.rs" === "a/b.rs").
 */

/** Metadata describing a single entry returned by `list`/`stat`. */
export interface FileStat {
  /** Normalised POSIX path of the entry, relative to the provider root. */
  path: string;
  /** Whether the entry is a directory. */
  isDirectory: boolean;
  /** Size in bytes (0 for directories or when the backend cannot report it). */
  size: number;
  /** Last-modified time in epoch milliseconds, when the backend tracks it. */
  mtime?: number;
}

/** Error thrown when an operation targets a path that does not exist. */
export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`File not found: ${path}`);
    this.name = "FileNotFoundError";
  }
}

/**
 * Unified file-system abstraction. Every storage backend implements this so
 * the editor, explorer, and tooling can be written against one contract.
 */
export interface FileSystemProvider {
  /** Stable identifier of the backend, e.g. "browser" | "local" | "github". */
  readonly id: string;

  /** Read a UTF-8 text file. Throws `FileNotFoundError` if absent. */
  readFile(path: string): Promise<string>;

  /** Create or overwrite a UTF-8 text file, creating parent dirs as needed. */
  writeFile(path: string, content: string): Promise<void>;

  /** Delete a file (or empty directory). No-op if the path does not exist. */
  delete(path: string): Promise<void>;

  /** Whether a file or directory exists at `path`. */
  exists(path: string): Promise<boolean>;

  /**
   * List immediate children of a directory. Returns `[]` for an empty or
   * missing directory. Pass "" (root) to list the top level.
   */
  list(dir: string): Promise<FileStat[]>;

  /** Stat a single entry. Throws `FileNotFoundError` if absent. */
  stat(path: string): Promise<FileStat>;
}

/**
 * Normalise a path to the provider-internal canonical form:
 *  - backslashes → forward slashes
 *  - collapse duplicate slashes
 *  - resolve "." and ".." segments
 *  - strip leading/trailing slashes
 *
 * Throws if the path escapes the root via "..".
 */
export function normalizePath(input: string): string {
  const raw = input.replace(/\\/g, "/");
  const out: string[] = [];
  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) {
        throw new Error(`Path escapes root: ${input}`);
      }
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/** Return the parent directory of a normalised path ("" for top-level). */
export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
}

/** Return the final path segment (file or directory name). */
export function basename(path: string): string {
  const normalized = normalizePath(path);
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}
