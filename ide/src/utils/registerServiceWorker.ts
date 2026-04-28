/**
 * registerServiceWorker.ts
 *
 * Registers /sw.js once on the first client-side render.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * After registration it:
 *  1. Checks for a waiting SW and posts SKIP_WAITING so updates go live fast.
 *  2. Fires a one-off "stellar-ide-sync" background sync tag so any queued
 *     mutations from previous sessions are replayed immediately.
 */

let registered = false;

export async function registerServiceWorker(): Promise<void> {
  if (registered) return;
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] Service workers not supported in this browser.");
    return;
  }

  registered = true;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });

    console.log("[SW] Registered:", registration.scope);

    // Activate any waiting worker immediately
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    // Trigger replay of any queued offline mutations from previous sessions
    const reg = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    if (reg.sync) {
      await reg.sync.register("stellar-ide-sync").catch(() => {});
    }
  } catch (err) {
    console.error("[SW] Registration failed:", err);
  }
}
