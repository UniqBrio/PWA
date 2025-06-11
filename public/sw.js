const CACHE_NAME = 'task-manager-pwa-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  // Ensure these icons are present in your /public/icons directory
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-96x96.png', // Commonly used for notification badges
  // For Next.js, precaching is often handled by plugins like next-pwa for better accuracy with built assets.
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
  console.log('[Service Worker] Push Received.');

  let pushData = {
    title: 'Task Manager PWA',
    body: 'You have a new notification!',
    icon: '/icons/icon-192x192.png', // Default icon
    badge: '/icons/icon-96x96.png',  // Default badge
    data: { url: '/' }               // Default click action data
  };

  if (event.data) {
    try {
      const eventJson = event.data.json();
      // Merge received data with defaults, allowing server to override
      pushData = { ...pushData, ...eventJson };
      // Ensure `data` property from push payload is also merged if present
      if (eventJson.data) {
        pushData.data = { ...pushData.data, ...eventJson.data };
      }
    } catch (e) {
      console.warn('[Service Worker] Push event data is not JSON, treating as text for body.');
      pushData.body = event.data.text();
    }
  }

  const title = pushData.title;
  const options = {
    body: pushData.body,
    icon: pushData.icon,
    badge: pushData.badge, // Used on Android status bar
    data: pushData.data,   // Pass custom data to the notification for click handling
    // Example actions:
    // actions: [
    //   { action: 'view', title: 'View Task', icon: '/icons/action-view.png' },
    //   { action: 'dismiss', title: 'Dismiss', icon: '/icons/action-dismiss.png' }
    // ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click event: handle user interaction with notification
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();

  // Default URL to open if no specific URL is in notification data
  const defaultUrl = '/';
  let urlToOpen = defaultUrl;

  // Use the URL from the notification's data payload if available
  if (event.notification.data && event.notification.data.url) {
    urlToOpen = event.notification.data.url;
  }

  // If an action was defined and clicked (e.g., 'view')
  // if (event.action === 'view' && event.notification.data && event.notification.data.taskUrl) {
  //   urlToOpen = event.notification.data.taskUrl;
  // } else if (event.action === 'dismiss') {
  //   // Just close, already handled by event.notification.close()
  //   return;
  // }

  // Attempt to focus an existing window/tab or open a new one
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true // Important to find all clients
    }).then(windowClients => {
      // Check if a window with the target URL is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Compare pathnames to handle potential query params or hash differences
        if (new URL(client.url).pathname === new URL(urlToOpen, self.location.origin).pathname && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open with that URL, or it cannot be focused, open a new one.
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});