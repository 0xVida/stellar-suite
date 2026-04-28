/**
 * Stellar IDE — Service Worker (sw.js)
 *
 * Strategy:
 *  • Static assets  → Cache-First  (install pre-cache + runtime cache)
 *  • API / RPC       → Network-First, fall back to cached response where safe
 *  • Mutations (POST/PUT/PATCH) → Enqueue to IDB when offline, flush on sync
 *
 * Background Sync tag: "stellar-ide-sync"
 */

const SW_VERSION = "v1.0.0";
const STATIC_CACHE = `stellar-ide-static-${SW_VERSION}`;
const RUNTIME_CACHE = `stellar-ide-runtime-${SW_VERSION}`;
const DEPENDENCY_CACHE = `stellar-ide-dependencies-${SW_VERSION}`;
const OFFLINE_QUEUE_STORE = "stellar-offline-queue";
const OFFLINE_QUEUE_DB = "stellar-sw-db";

// ─── Assets to pre-cache on install ─────────────────────────────────────────
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon.png",
  "/robots.txt",
];

// ─── IndexedDB helpers (sw context — no idb-keyval available) ────────────────
function openSwDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    req.onupgradeneeded = (evt) => {
      const db = evt.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        db.createObjectStore(OFFLINE_QUEUE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueRequest(request) {
  const db = await openSwDb();
  return new Promise((resolve, reject) => {
    const body = request.bodyUsed ? null : request.clone();
    // Serialise what we need to replay
    const entry = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: Date.now(),
    };
    // Read body text if available
    const doEnqueue = (bodyText) => {
      entry.body = bodyText;
      const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
      const store = tx.objectStore(OFFLINE_QUEUE_STORE);
      const addReq = store.add(entry);
      addReq.onsuccess = () => resolve(addReq.result);
      addReq.onerror = () => reject(addReq.error);
    };

    if (body) {
      body.text().then(doEnqueue).catch(() => doEnqueue(null));
    } else {
      doEnqueue(null);
    }
  });
}

async function getAllQueued() {
  const db = await openSwDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
    const req = tx.objectStore(OFFLINE_QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearQueueEntry(id) {
  const db = await openSwDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
    const req = tx.objectStore(OFFLINE_QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getQueueLength() {
  const db = await openSwDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
    const req = tx.objectStore(OFFLINE_QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log(`[SW ${SW_VERSION}] Installing…`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        // Non-fatal: some assets may not exist yet in standalone output
        console.warn("[SW] Pre-cache partial failure:", err.message);
      });
    }).then(() => {
      console.log(`[SW ${SW_VERSION}] Pre-cache complete. Skipping waiting.`);
      return self.skipWaiting();
    })
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log(`[SW ${SW_VERSION}] Activating…`);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE && k !== DEPENDENCY_CACHE)
          .map((k) => {
            console.log(`[SW] Deleting old cache: ${k}`);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isStaticAsset(url) {
  const { pathname } = new URL(url);
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.match(/\.(png|svg|ico|woff2?|ttf|otf|css)$/)
  );
}

function isDependencyRequest(url) {
  const { hostname } = new URL(url);
  return (
    hostname.endsWith("crates.io") ||
    hostname.endsWith("rust-lang.org") ||
    hostname === "raw.githubusercontent.com"
  );
}

function isMutation(request) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
}

function isApiCall(url) {
  const { pathname } = new URL(url);
  return pathname.startsWith("/api/") || pathname.startsWith("/rpc");
}

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET Chrome-extension or data: requests
  if (!request.url.startsWith("http")) return;

  // ── Mutation requests: try network, queue on failure ──────────────────────
  if (isMutation(request)) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        await enqueueRequest(request.clone());
        // Notify all clients about the new queue entry
        const clients = await self.clients.matchAll();
        const queueLen = await getQueueLength();
        clients.forEach((c) =>
          c.postMessage({ type: "OFFLINE_QUEUE_UPDATE", count: queueLen })
        );
        return new Response(
          JSON.stringify({
            queued: true,
            message: "Request queued for offline sync",
          }),
          {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // ── Dependency assets: Cache-First (Heavy Caching) ────────────────────────
  if (isDependencyRequest(request.url)) {
    event.respondWith(
      caches.open(DEPENDENCY_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) {
            // Notify clients of cache hit for monitoring
            self.clients.matchAll().then((clients) => {
              clients.forEach((c) => c.postMessage({ type: "CACHE_HIT", url: request.url }));
            });
            return cached;
          }
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // ── Static assets: Cache-First ────────────────────────────────────────────
  if (isStaticAsset(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── API calls: Network-First ──────────────────────────────────────────────
  if (isApiCall(request.url)) {
    event.respondWith(
      fetch(request.clone())
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ offline: true }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
              })
          )
        )
    );
    return;
  }

  // ── Navigation / HTML: Network-First, fall back to cached "/" ────────────
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then(
          (cached) =>
            cached ||
            new Response("<h1>Offline</h1><p>Stellar IDE is offline.</p>", {
              headers: { "Content-Type": "text/html" },
            })
        )
      )
    );
    return;
  }

  // ── Everything else: Stale-While-Revalidate ───────────────────────────────
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone));
        }
        return response;
      });
      return cached || fetchPromise;
    })
  );
});

// ─── Background Sync ─────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "stellar-ide-sync") {
    console.log("[SW] Background sync triggered — flushing offline queue…");
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const entries = await getAllQueued();
  console.log(`[SW] Replaying ${entries.length} queued request(s)…`);

  const clients = await self.clients.matchAll();

  for (const entry of entries) {
    try {
      const init = {
        method: entry.method,
        headers: entry.headers,
      };
      if (entry.body) init.body = entry.body;

      const response = await fetch(entry.url, init);
      if (response.ok || response.status < 500) {
        await clearQueueEntry(entry.id);
        console.log(`[SW] Replayed ${entry.method} ${entry.url} → ${response.status}`);
      } else {
        console.warn(`[SW] Server error replaying ${entry.url}: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[SW] Failed to replay ${entry.url}:`, err.message);
      // Leave in queue — will retry on next sync
    }
  }

  const remaining = await getQueueLength();
  clients.forEach((c) =>
    c.postMessage({ type: "OFFLINE_QUEUE_UPDATE", count: remaining })
  );
  clients.forEach((c) =>
    c.postMessage({ type: "SYNC_COMPLETE", replayed: entries.length - remaining })
  );
}

// ─── Message handling (from client) ──────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_QUEUE_LENGTH") {
    getQueueLength().then((count) => {
      event.source?.postMessage({ type: "OFFLINE_QUEUE_UPDATE", count });
    });
  }
});
