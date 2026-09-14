/* ============================================================
   UniSolve Service Worker
   Cache-first for app shell, network-first for API calls.
   ============================================================ */

const CACHE_NAME = "unisolve-v1";

/* Assets to pre-cache on install (app shell) */
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

/* ---------- INSTALL ---------- */
self.addEventListener("install", (event) => {
  console.log("[SW] Installing…");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache partially failed:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating…");
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim())
  );
});

/* ---------- FETCH ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* Only handle GET requests */
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Skip Firebase / cross-origin API calls — let them hit the network directly */
  if (
    url.origin !== self.location.origin ||
    url.hostname.indexOf("firebase") !== -1 ||
    url.hostname.indexOf("googleapis") !== -1 ||
    url.hostname.indexOf("gstatic") !== -1 ||
    url.hostname.indexOf("actions.google.com") !== -1
  ) {
    return;
  }

  /* Skip chrome-extension and non-http(s) */
  if (!url.protocol.startsWith("http")) return;

  /* Network-first for HTML navigations so users get the freshest app shell */
  if (req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") !== -1) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return response;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            return cached || caches.match("./index.html");
          });
        })
    );
    return;
  }

  /* Cache-first for everything else (static assets) */
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((response) => {
        /* Only cache valid same-origin successful responses */
        if (
          !response ||
          response.status !== 200 ||
          response.type !== "basic"
        ) {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return response;
      }).catch(() => {
        /* Offline fallback for images / icons */
        if (req.destination === "image") {
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" fill="#0f172a"/><text x="96" y="110" font-size="80" text-anchor="middle" fill="#6d28d9" font-family="sans-serif" font-weight="bold">US</text></svg>',
            { headers: { "Content-Type": "image/svg+xml" } }
          );
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      });
    })
  );
});

/* ---------- MESSAGE (skipWaiting from client) ---------- */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
