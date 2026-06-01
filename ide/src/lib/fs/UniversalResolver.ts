/**
 * Resolves workspace-relative paths and remote https:// imports for compile payloads.
 * Remote files are cached in IndexedDB for faster subsequent loads.
 */

const REMOTE_IMPORT_DB = "stellar-suite-remote-imports";
const REMOTE_IMPORT_STORE = "files";
const REMOTE_IMPORT_DB_VERSION = 1;

const HTTPS_IMPORT_RE =
  /(?:use\s+[\w:]+(?:\s*::\s*[\w:]+)*\s*=\s*|mod\s+|#\[path\s*=\s*)["'](https?:\/\/[^"']+)["']/g;

export interface ResolvedRemoteFile {
  url: string;
  content: string;
  fromCache: boolean;
  virtualPath: string;
}

export interface WorkspaceCompileFile {
  path: string;
  content: string;
  language?: string;
}

function openRemoteImportDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REMOTE_IMPORT_DB, REMOTE_IMPORT_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(REMOTE_IMPORT_STORE)) {
        req.result.createObjectStore(REMOTE_IMPORT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isRemoteImport(specifier: string): boolean {
  return /^https?:\/\//i.test(specifier.trim());
}

/** Sanitize a remote URL into a stable IndexedDB cache key. */
export function sanitizeRemoteCacheKey(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported remote protocol: ${parsed.protocol}`);
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
}

/** Map a remote URL to a virtual workspace path for the compiler payload. */
export function remoteUrlToVirtualPath(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const fileName = segments.pop() ?? "remote.rs";
  const hostDir = parsed.hostname.replace(/\./g, "_");
  return `remote/${hostDir}/${segments.join("_") || "root"}/${fileName}`;
}

export function extractRemoteImportUrls(content: string): string[] {
  const urls = new Set<string>();
  for (const match of content.matchAll(HTTPS_IMPORT_RE)) {
    const url = match[1];
    if (url) urls.add(url);
  }
  return [...urls];
}

async function readCachedRemote(url: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  const key = sanitizeRemoteCacheKey(url);
  const db = await openRemoteImportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMOTE_IMPORT_STORE, "readonly");
    const req = tx.objectStore(REMOTE_IMPORT_STORE).get(key);
    req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => reject(req.error);
  });
}

async function writeCachedRemote(url: string, content: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const key = sanitizeRemoteCacheKey(url);
  const db = await openRemoteImportDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMOTE_IMPORT_STORE, "readwrite");
    tx.objectStore(REMOTE_IMPORT_STORE).put(content, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function resolveRemoteImport(url: string): Promise<ResolvedRemoteFile> {
  if (!isRemoteImport(url)) {
    throw new Error(`Not a remote import URL: ${url}`);
  }

  const cached = await readCachedRemote(url);
  if (cached !== null) {
    return {
      url,
      content: cached,
      fromCache: true,
      virtualPath: remoteUrlToVirtualPath(url),
    };
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/plain, application/octet-stream, */*" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote import (${response.status}): ${url}`);
  }

  const content = await response.text();
  await writeCachedRemote(url, content);

  return {
    url,
    content,
    fromCache: false,
    virtualPath: remoteUrlToVirtualPath(url),
  };
}

/**
 * Expand compile files with any https:// dependencies referenced in source.
 */
export async function resolveWorkspaceCompileFiles(
  files: WorkspaceCompileFile[],
): Promise<WorkspaceCompileFile[]> {
  const byPath = new Map(files.map((file) => [file.path, { ...file }]));
  const pendingUrls = new Set<string>();

  for (const file of files) {
    for (const url of extractRemoteImportUrls(file.content)) {
      pendingUrls.add(url);
    }
  }

  for (const url of pendingUrls) {
    const resolved = await resolveRemoteImport(url);
    if (!byPath.has(resolved.virtualPath)) {
      byPath.set(resolved.virtualPath, {
        path: resolved.virtualPath,
        content: resolved.content,
        language: "rust",
      });
    }
  }

  return [...byPath.values()];
}

export class UniversalResolver {
  async resolve(specifier: string): Promise<ResolvedRemoteFile | null> {
    if (!isRemoteImport(specifier)) return null;
    return resolveRemoteImport(specifier);
  }

  async resolveWorkspaceFiles(files: WorkspaceCompileFile[]): Promise<WorkspaceCompileFile[]> {
    return resolveWorkspaceCompileFiles(files);
  }
}
