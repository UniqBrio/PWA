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
  let pushPayload = {
    title: 'Task Manager', // Default title
    body: 'You have a new notification.', // Default body
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png', // Often a monochrome icon for status bar
    data: { url: '/' }, // Default click action data; passed to notificationclick
    actions: [], // e.g., [{ action: 'view', title: 'View Task', icon: '/icons/action-view.png' }]
    tag: undefined, // Optional: for replacing/grouping notifications
    renotify: false, // Optional: re-alert user for same tag
    // vibrate: [100, 50, 100], // Optional: vibration pattern
    // requireInteraction: false, // Optional: if notification should persist
  };

  if (event.data) {
    try {
      const receivedData = event.data.json();
      // Merge received data with defaults, received data takes precedence
      // but ensure critical fields have fallbacks if receivedData provides null/undefined
      pushPayload.title = receivedData.title || pushPayload.title;
      pushPayload.body = receivedData.body || pushPayload.body;
      pushPayload.icon = receivedData.icon || pushPayload.icon;
      pushPayload.badge = receivedData.badge || pushPayload.badge;
      pushPayload.data = receivedData.data || pushPayload.data;
      pushPayload.actions = receivedData.actions || pushPayload.actions;
      pushPayload.tag = receivedData.tag; // Can be undefined
      pushPayload.renotify = receivedData.renotify || false;
      // pushPayload.vibrate = receivedData.vibrate || pushPayload.vibrate;
      // pushPayload.requireInteraction = receivedData.requireInteraction || pushPayload.requireInteraction;
    } catch (e) {
      // If payload is not JSON, assume it's a string for the body
      pushPayload.body = event.data.text();
      // Other defaults (title, icon, etc.) remain as set initially
    }
  }

  const notificationOptions = {
    body: pushPayload.body,
    icon: new URL(pushPayload.icon, self.location.origin).href,
    badge: new URL(pushPayload.badge, self.location.origin).href,
    data: pushPayload.data,
    actions: pushPayload.actions,
    tag: pushPayload.tag,
    renotify: pushPayload.renotify,
    // vibrate: pushPayload.vibrate,
    // requireInteraction: pushPayload.requireInteraction,
  };

  event.waitUntil(
    self.registration.showNotification(pushPayload.title, notificationOptions)
  );
});

// Notification click event: handle user interaction with notification
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click Received.', event.action, event.notification.data);
  event.notification.close();

  // Default URL to open if no specific URL is in notification data
  const defaultUrl = '/';
  let urlToOpen = defaultUrl;

  // Use the URL from the notification's data payload if available
  const notificationPayloadData = event.notification.data || {};
  urlToOpen = notificationPayloadData.url || defaultUrl;

  // Handle specific actions defined in the notification
  if (event.action) {
    console.log(`[Service Worker] Notification action clicked: ${event.action}`);
    // Example: if you have an action { action: 'view_details', title: 'View Details' }
    // and your data payload includes a specific URL for that action:
    // if (event.action === 'view_details' && notificationPayloadData.detailsUrl) {
    //   urlToOpen = notificationPayloadData.detailsUrl;
    // } else if (event.action === 'mark_done' && notificationPayloadData.taskId) {
    //   // Perform a background task, e.g., API call
    //   // event.waitUntil(
    //   //   fetch(`/api/tasks/${notificationPayloadData.taskId}/complete`, { method: 'POST' })
    //   //     .then(() => console.log('Task marked complete via notification action.'))
    //   //     .catch(err => console.error('Failed to mark task complete:', err))
    //   // );
    //   // return; // Optionally, don't open a window for this action
    // }
    // Add more 'else if' blocks for other actions
  }

  // Attempt to focus an existing window/tab or open a new one
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {
      const targetUrl = new URL(urlToOpen, self.location.origin);
      // Check if a window with the target URL is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Compare pathnames to handle potential query params or hash differences
        if (new URL(client.url).pathname === targetUrl.pathname && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open with that URL, or it cannot be focused, open a new one.
      if (clients.openWindow) {
        return clients.openWindow(targetUrl.href);
      }
    })
  );
});