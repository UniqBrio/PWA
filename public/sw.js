const CACHE_NAME = 'task-manager-pwa-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  // Add paths to your most important icons if not covered by runtime caching strategy
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
  // Add other critical assets like global CSS if not bundled dynamically by Next.js
  // e.g. '/globals.css' - but verify how Next.js handles this.
];

// Install event: precache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting()) // Activate worker immediately
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all clients
  );
});

// Fetch event: serve from cache or network
self.addEventListener('fetch', event => {
  // For navigation requests, use a network-first strategy.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If successful, clone and cache the response for future offline use.
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // If network fails, try to serve the main page from cache.
          return caches.match('/');
        })
    );
    return;
  }

  // For other requests (assets, API calls), try cache first, then network.
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Optionally, cache dynamic assets/API responses here if appropriate
          // Be careful with caching POST requests or sensitive data.
          return networkResponse;
        });
      })
  );
});

// Push event: handle incoming push notifications
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: 'Task Manager', body: 'You have a new notification.', icon: '/icons/icon-192x192.png' };
  const title = data.title || 'Task Manager PWA';
  const options = {
    body: data.body || 'New update available.',
    icon: data.icon || '/icons/icon-192x192.png', // Default icon
    badge: data.badge || '/icons/icon-96x96.png', // Small icon for notification bar
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event: handle user interaction with notification
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data && event.notification.data.url ? event.notification.data.url : '/'));
});