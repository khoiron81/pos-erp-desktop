/*
POS ERP UMKM - Service Worker
Material Store Edition

Developed by PT. Aktech Digital Solutions
*/

const CACHE_NAME = 'pos-erp-umkm-v2';
const PRECACHE_URLS = [
    '/',
    '/pos',
    '/dashboard',
    '/manifest.json',
];

// Install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

// Activate — purge old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — cache-first for static assets (offline-first POS)
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Non-GET requests bypass cache entirely
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Always go to network for API/auth calls — never serve stale auth or data
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sanctum/')) return;

    // Cache-first: return cached copy immediately if available, otherwise fetch & cache
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request).then((response) => {
                if (response.ok && (
                    url.pathname.startsWith('/_next/static/') ||
                    url.pathname.startsWith('/static/') ||
                    PRECACHE_URLS.includes(url.pathname)
                )) {
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
                }
                return response;
            }).catch(() => {
                // Offline fallback for navigation requests
                if (request.mode === 'navigate') {
                    return caches.match('/') || new Response('Offline', { status: 503 });
                }
                return new Response('Offline', { status: 503 });
            });
        })
    );
});
