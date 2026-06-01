/**
 * Issue #882 — Local (Node `fs`) adapter for {@link FileSystemProvider}.
 *
 * Rooted at a real directory on disk; all provider paths are resolved relative
 * to that root. Used by the desktop build and server-side API routes that today
 * call `node:fs` directly. The root containment check guards against `..`
 * traversal escaping the workspace.
 */
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import {
  FileNotFoundError,
  type FileStat,
  type FileSystemProvider,
  normalizePath,
} from "../FileSystemProvider";

export class LocalFileSystemProvider implements FileSystemProvider {
  readonly id = "local";
  private readonly root: string;
  private readonly fs: typeof nodeFs;

  /**
   * @param root  Absolute directory that bounds this provider.
   * @param fsImpl Injectable fs implementation (defaults to node:fs/promises),
   *               primarily to allow deterministic unit testing.
   */
  constructor(root: string, fsImpl: typeof nodeFs = nodeFs) {
    this.root = root;
    this.fs = fsImpl;
  }

  /** Resolve a provider path to an absolute on-disk path inside the root. */
  private resolve(path: string): string {
    const normalized = normalizePath(path);
    return normalized === ""
      ? this.root
      : nodePath.join(this.root, normalized);
  }

  async readFile(path: string): Promise<string> {
    try {
      return await this.fs.readFile(this.resolve(path), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileNotFoundError(normalizePath(path));
      }
      throw err;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const abs = this.resolve(path);
    await this.fs.mkdir(nodePath.dirname(abs), { recursive: true });
    await this.fs.writeFile(abs, content, "utf-8");
  }

  async delete(path: string): Promise<void> {
    try {
      await this.fs.rm(this.resolve(path), { recursive: true, force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.fs.stat(this.resolve(path));
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<FileStat[]> {
    const abs = this.resolve(dir);
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await this.fs.readdir(abs, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const base = normalizePath(dir);
    const prefix = base === "" ? "" : `${base}/`;
    const results: FileStat[] = [];
    for (const entry of entries) {
      const childPath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        results.push({ path: childPath, isDirectory: true, size: 0 });
      } else {
        const st = await this.fs.stat(nodePath.join(abs, entry.name));
        results.push({
          path: childPath,
          isDirectory: false,
          size: st.size,
          mtime: st.mtimeMs,
        });
      }
    }
    return results;
  }

  async stat(path: string): Promise<FileStat> {
    try {
      const st = await this.fs.stat(this.resolve(path));
      return {
        path: normalizePath(path),
        isDirectory: st.isDirectory(),
        size: st.isDirectory() ? 0 : st.size,
        mtime: st.mtimeMs,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileNotFoundError(normalizePath(path));
      }
      throw err;
    }
  }
}
