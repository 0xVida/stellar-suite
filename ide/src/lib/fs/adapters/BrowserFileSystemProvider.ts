/**
 * Issue #882 — Browser (IndexedDB) adapter for {@link FileSystemProvider}.
 *
 * Stores each file as a record keyed by its normalised path in a single
 * IndexedDB object store. Directories are implicit: they exist when at least
 * one file is stored beneath them. This is the default backend for in-browser
 * workspaces and replaces ad-hoc localStorage/IndexedDB access scattered across
 * feature code.
 */
import {
  FileNotFoundError,
  type FileStat,
  type FileSystemProvider,
  basename,
  normalizePath,
} from "../FileSystemProvider";

interface StoredFile {
  path: string;
  content: string;
  size: number;
  mtime: number;
}

const DEFAULT_DB = "stellar-suite-fs";
const STORE = "files";
const DB_VERSION = 1;

export class BrowserFileSystemProvider implements FileSystemProvider {
  readonly id = "browser";
  private readonly dbName: string;

  constructor(dbName: string = DEFAULT_DB) {
    this.dbName = dbName;
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available in this environment"));
        return;
      }
      const req = indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "path" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async getRecord(path: string): Promise<StoredFile | undefined> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(path);
      req.onsuccess = () =>
        resolve(req.result as StoredFile | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private async allRecords(): Promise<StoredFile[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as StoredFile[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async readFile(path: string): Promise<string> {
    const key = normalizePath(path);
    const rec = await this.getRecord(key);
    if (!rec) throw new FileNotFoundError(key);
    return rec.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const key = normalizePath(path);
    const db = await this.openDb();
    const record: StoredFile = {
      path: key,
      content,
      size: content.length,
      mtime: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(path: string): Promise<void> {
    const key = normalizePath(path);
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async exists(path: string): Promise<boolean> {
    const key = normalizePath(path);
    if (await this.getRecord(key)) return true;
    // Treat as an (implicit) directory if any file lives beneath it.
    const prefix = key === "" ? "" : `${key}/`;
    const all = await this.allRecords();
    return all.some((r) => r.path.startsWith(prefix) && r.path !== key);
  }

  async list(dir: string): Promise<FileStat[]> {
    const base = normalizePath(dir);
    const prefix = base === "" ? "" : `${base}/`;
    const all = await this.allRecords();
    const seen = new Map<string, FileStat>();

    for (const rec of all) {
      if (!rec.path.startsWith(prefix)) continue;
      const rest = rec.path.slice(prefix.length);
      if (rest === "") continue;
      const slash = rest.indexOf("/");
      if (slash === -1) {
        // Direct file child.
        seen.set(rec.path, {
          path: rec.path,
          isDirectory: false,
          size: rec.size,
          mtime: rec.mtime,
        });
      } else {
        // Immediate subdirectory.
        const childDir = `${prefix}${rest.slice(0, slash)}`;
        if (!seen.has(childDir)) {
          seen.set(childDir, { path: childDir, isDirectory: true, size: 0 });
        }
      }
    }
    return [...seen.values()];
  }

  async stat(path: string): Promise<FileStat> {
    const key = normalizePath(path);
    const rec = await this.getRecord(key);
    if (rec) {
      return {
        path: key,
        isDirectory: false,
        size: rec.size,
        mtime: rec.mtime,
      };
    }
    if (await this.exists(key)) {
      return { path: key, isDirectory: true, size: 0 };
    }
    throw new FileNotFoundError(key);
  }

  /** Lightweight existence check used by `basename`-derived display logic. */
  displayName(path: string): string {
    return basename(path);
  }
}
