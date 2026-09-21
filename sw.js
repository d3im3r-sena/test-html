/**
 * Service Worker - Centro de Ciencia Nova (PWA)
 * Estrategia de caché avanzada y soporte offline completo
 */

const CACHE_NAME = 'nova-cache-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/main.js',
    './manifest.webmanifest',
    './manifest.json',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png'
];

// 1. Instalación del Service Worker: precaché de recursos críticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precachando recursos esenciales de Nova...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 2. Activación: limpieza de cachés antiguos y reclamación de clientes
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Eliminando versión obsoleta de caché:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Estrategia de Fetch: Stale-While-Revalidate para recursos estáticos
self.addEventListener('fetch', (event) => {
    // Solo procesar peticiones HTTP/HTTPS GET
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);

    // Evitar interceptar extensiones de navegador u orígenes extraños
    if (!requestUrl.protocol.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    // Si es una respuesta válida, almacenarla en caché para uso offline
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Si la red falla y no hay respuesta en caché para navegación, retornar index.html
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });

            // Retornar caché primero si existe, o esperar a la red
            return cachedResponse || fetchPromise;
        })
    );
});

// 4. Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
