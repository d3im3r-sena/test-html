/**
 * Service Worker - RoboDocs (Robótica Industrial)
 * Soporte offline 100%, almacenamiento en caché y estrategia Stale-While-Revalidate
 */

const CACHE_NAME = 'robodocs-cache-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/latex-parser.js',
    './js/docs-app.js',
    './manifest.webmanifest',
    './manifest.json',
    './docs/index.json',
    './docs/cinematica_manipulador_6dof.tex',
    './docs/control_dinamica_trayectorias.tex',
    './docs/seguridad_cobots_iso.tex',
    './docs/vision_artificial_pick_and_place.tex',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png'
];

// 1. Instalación: precaché de recursos críticos de documentación
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[RoboDocs SW] Precachando plataforma de documentación...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 2. Activación: limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[RoboDocs SW] Purgando versión previa de caché:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Interceptación Fetch: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const reqUrl = new URL(event.request.url);
    if (!reqUrl.protocol.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, copy);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });

            return cachedResponse || fetchPromise;
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
