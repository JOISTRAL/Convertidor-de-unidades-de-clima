// === Config ===
const VERSION = 'v1.1.0';
const STATIC_CACHE = `temperature-converter-static-${VERSION}`;
const RUNTIME_CACHE = `temperature-converter-runtime-${VERSION}`;

// Archivos necesarios para funcionar offline
const PRECACHE_ASSETS = [
  './',               // importante para GitHub Pages (Project Page)
  './index.html',
  './converter.js',
  './converter.css',
  './manifest.json',
  './icon512.png'
];

// === Install: precache ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  // pasa a 'activate' sin esperar a que se cierren las pestañas
  self.skipWaiting();
});

// === Activate: limpia versiones viejas ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// === Fetch strategies ===
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 1) Navegaciones (location bar / SPA): sirve index.html offline
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // intenta red y refresca caché
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          // sin red: entrega versión en caché
          return (await caches.match('./index.html')) ||
                 new Response('Sin conexión y sin caché para index.html', { status: 503 });
        }
      })()
    );
    return;
  }

  // 2) Assets precacheados: cache-first
  if (PRECACHE_ASSETS.some((p) => samePath(url.pathname, p))) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // 3) Misma-origen (scripts/estilos adicionales): network-first con fallback a caché
  if (isSameOrigin) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 4) Terceros (CDNs, etc.): network con fallback a caché si existe (stale-if-offline)
  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// === Helpers ===
async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req) || await caches.match(req);
    if (cached) return cached;
    return new Response('Sin conexión y recurso no cacheado.', { status: 503 });
  }
}

// Compara rutas teniendo en cuenta que usamos rutas relativas en PRECACHE_ASSETS
function samePath(pathname, relative) {
  // normaliza './archivo' -> '/archivo'
  const norm = relative.replace(/^\.\//, '/');
  return pathname === norm || pathname.endsWith(norm);
}
