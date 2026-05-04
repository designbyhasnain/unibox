// Unibox service worker — Phase 2.3 of the Gmail-fast plan.
//
// Strategy:
//   - Static assets (`/_next/static/*`, fonts, images): cache-first.
//     Once cached, repeat visits paint without hitting the network.
//   - HTML routes (`/dashboard`, `/`, etc.): network-first with stale
//     fallback. Always serve fresh when online; show last-good when
//     offline so the shell still appears.
//   - API + server actions (`/api/*`, `/_next/data/*`): network-only.
//     Live data must never be cached at the service-worker layer —
//     auth + Realtime correctness depend on it.
//
// Cache-bust strategy: `CACHE_VERSION` is the source of truth. Bump it
// on any deploy that changes the cached strategy itself. Static asset
// URLs already include content hashes, so old assets age out
// naturally.

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `unibox-static-${CACHE_VERSION}`;
const HTML_CACHE = `unibox-html-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
    // Activate the new SW as soon as install completes.
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    // Drop any caches that aren't part of the current version.
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((k) => !k.endsWith(`-${CACHE_VERSION}`))
                    .map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

function isStaticAsset(url) {
    return (
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/icons/') ||
        url.pathname === '/manifest.json' ||
        /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|eot|css|js)$/.test(url.pathname)
    );
}

function isApi(url) {
    return (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/_next/data/') ||
        url.pathname.startsWith('/_next/image')
    );
}

function isNavigation(request) {
    return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return; // POST / PATCH / DELETE pass through

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // Only handle same-origin

    if (isApi(url)) return; // Live data — never cache at SW layer

    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    if (isNavigation(request)) {
        event.respondWith(networkFirst(request, HTML_CACHE));
        return;
    }
});

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
    } catch (err) {
        // Last-ditch: return cached even if request mismatched.
        const fallback = await cache.match(request, { ignoreVary: true });
        if (fallback) return fallback;
        throw err;
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
    }
}
