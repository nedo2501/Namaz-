// ═══════════════════════════════════════════════
//  NAUČI NAMAZ — Service Worker
//  Omogućava offline rad i instalaciju kao PWA
// ═══════════════════════════════════════════════

const CACHE_NAME = 'nauci-namaz-v1.0';
const CACHE_URLS = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png'
];

// ── INSTALL: cache sve potrebne fajlove ──
self.addEventListener('install', event => {
  console.log('[SW] Instalacija — keširanje fajlova...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_URLS).then(() => {
        console.log('[SW] Svi fajlovi keširani');
        return self.skipWaiting();
      });
    })
  );
});

// ── ACTIVATE: obriši stare keš verzije ──
self.addEventListener('activate', event => {
  console.log('[SW] Aktivacija...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Briše stari keš:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: serviraj iz keša, fallback na mrežu ──
self.addEventListener('fetch', event => {
  // Preskoči non-GET zahtjeve i external URL-ove (Google Fonts, Anthropic API)
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Za Google Fonts — network first, keš kao fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // Za API pozive (vaktija, Anthropic) — samo mreža, bez keširanja
  if (url.hostname === 'api.anthropic.com' || url.pathname.includes('/api/')) {
    return;
  }

  // Za lokalne fajlove — keš first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Servira iz keša, i u pozadini ažurira
        fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response);
              });
            }
          })
          .catch(() => {});
        return cached;
      }
      
      // Nije u kešu — preuzmi s mreže
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => {
        // Offline fallback — vrati index.html
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── PUSH: notifikacije za namaz (budući feature) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nauči Namaz', {
      body: data.body || 'Namasko vrijeme',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

console.log('[SW] Service Worker učitan — Nauči Namaz v1.0');
