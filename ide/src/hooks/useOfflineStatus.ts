/**
 * useOfflineStatus.ts
 *
 * React hook that tracks the browser's online/offline state and the number
 * of pending mutations queued in the service worker's IDB offline store.
 *
 * The SW posts a "OFFLINE_QUEUE_UPDATE" message whenever the queue length
 * changes (enqueue or flush). We listen for it here and update state.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { getOfflineQueueLength } from "@/utils/offlineQueue";

export type SyncState = "idle" | "syncing" | "synced";

export interface OfflineStatus {
  /** True when navigator.onLine is false */
  isOffline: boolean;
  /** Number of queued mutations not yet replayed */
  pendingSyncCount: number;
  /** Current sync lifecycle state */
  syncState: SyncState;
  /** Number of dependencies loaded from SW cache */
  cacheHitCount: number;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [cacheHitCount, setCacheHitCount] = useState<number>(0);

  // Refresh queue count from IDB
  const refreshQueueCount = useCallback(async () => {
    const count = await getOfflineQueueLength();
    setPendingSyncCount(count);
  }, []);

  useEffect(() => {
    // Initial queue count read
    refreshQueueCount();

    const handleOnline = () => {
      setIsOffline(false);
      setSyncState("syncing");
      // Trigger background sync if SW supports it
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready
          .then((reg) => (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("stellar-ide-sync"))
          .catch(() => {/* sync not available, SW flushes on its own */});
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setSyncState("idle");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listen to messages from the service worker
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_QUEUE_UPDATE") {
        const count = event.data.count as number;
        setPendingSyncCount(count);
      }
      if (event.data?.type === "SYNC_COMPLETE") {
        setSyncState("synced");
        setPendingSyncCount(0);
        // Reset to idle after 3 s so the "synced" indicator fades
        setTimeout(() => setSyncState("idle"), 3000);
      }
      if (event.data?.type === "CACHE_HIT") {
        setCacheHitCount((prev) => prev + 1);
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
      // Ask the SW for the current queue length on mount
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({ type: "GET_QUEUE_LENGTH" });
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
    };
  }, [refreshQueueCount]);

  return { isOffline, pendingSyncCount, syncState, cacheHitCount };
}
