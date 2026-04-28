/**
 * offlineQueue.ts
 *
 * Client-side helpers that read/write the same IDB store the service worker
 * uses.  These run in the browser (window) context, NOT inside the SW.
 *
 * DB: "stellar-sw-db"
 * Store: "stellar-offline-queue"
 */

const DB_NAME = "stellar-sw-db";
const STORE_NAME = "stellar-offline-queue";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Returns the number of requests currently in the offline queue. */
export async function getOfflineQueueLength(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

export interface OfflineQueueEntry {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
  timestamp: number;
}

/** Read all queued entries (for diagnostics / display). */
export async function getAllQueuedEntries(): Promise<OfflineQueueEntry[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as OfflineQueueEntry[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
