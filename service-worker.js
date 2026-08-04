const CACHE_NAME = 'adp-cyberos-v4-prod';
const ASSETS = [
    './',
    './index.html',
    './document.html',
    './passport.html',
    './css/style.css',
    './js/app.js',
    './js/document.js',
    './js/passport.js',
    './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); })
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Only cache GET requests and ignore chrome-extension:// etc.
    if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
    
    e.respondWith(
        caches.match(e.request).then((res) => {
            return res || fetch(e.request).then((fetchRes) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, fetchRes.clone());
                    return fetchRes;
                });
            }).catch(() => {
                if (e.request.destination === 'document') return caches.match('./index.html');
            });
        })
    );
});
