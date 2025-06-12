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
        if (cachedResponse) {
          // console.log('[SW] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // console.log('[SW] Not in cache, fetching from network:', event.request.url);
        return fetch(event.request).then(networkResponse => {
          // Optional: Cache responses for future offline use.
          // Be careful about what you cache, especially API responses or non-GET requests.
          // Example: Cache successful GET requests for assets, but not API calls.
          if (networkResponse.ok && event.request.method === 'GET' && !event.request.url.includes('/api/')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              // console.log('[SW] Caching network response for:', event.request.url);
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(error => {
          console.error('[SW] Network fetch failed for non-navigation request:', event.request.url, error);
          // Optionally, return a fallback response for specific asset types, e.g., a placeholder image
          // if (event.request.destination === 'image') return caches.match('/icons/default-image.png'); // Ensure placeholder exists
          throw error; // Re-throw to allow the browser to handle the network error
        });
      })
  );
});

// Push event: handle incoming push notifications
self.addEventListener('push', event => {
  let pushPayload = {
        title: 'Task Manager (Default)', // Default title
        body: 'You have a new notification. (Default)', // Default body
        icon: '/icons/icon-192x192.png', // Default icon
        badge: '/icons/icon-96x96.png', // Default badge
        data: { url: '/', source: 'default' }, // Default data
        actions: [],
        tag: undefined,
        renotify: false,
    // vibrate: [100, 50, 100], // Optional: vibration pattern
    // requireInteraction: false, // Optional: if notification should persist
  };

      console.log('[SW] Push event received:', event);
    
  if (event.data) {
        let receivedDataJson;
        let receivedDataText = 'N/A'; // Initialize to avoid undefined if text() fails
    try {
          // It's safer to clone if you need to access the data multiple times or in different formats.
          const dataCloneForText = event.data.clone();
          receivedDataText = dataCloneForText.text();
          console.log('[SW] Push data as text:', receivedDataText);
    
          receivedDataJson = event.data.json(); // This consumes the original event.data stream
          console.log('[SW] Push data parsed as JSON:', receivedDataJson);
    
      // Merge received data with defaults, received data takes precedence
      // but ensure critical fields have fallbacks if receivedData provides null/undefined
          // Use received value only if it's a non-empty string, otherwise fallback to SW default.
          pushPayload.title = (receivedDataJson.title && String(receivedDataJson.title).trim() !== "") ? String(receivedDataJson.title) : pushPayload.title;
          pushPayload.body = (receivedDataJson.body && String(receivedDataJson.body).trim() !== "") ? String(receivedDataJson.body) : pushPayload.body;
          pushPayload.icon = receivedDataJson.icon || pushPayload.icon;
          pushPayload.badge = receivedDataJson.badge || pushPayload.badge;
          pushPayload.data = receivedDataJson.data || pushPayload.data;
          pushPayload.actions = receivedDataJson.actions || pushPayload.actions;
          pushPayload.tag = receivedDataJson.tag;
          pushPayload.renotify = typeof receivedDataJson.renotify === 'boolean' ? receivedDataJson.renotify : pushPayload.renotify;
    } catch (e) {
          console.error('[SW] Error parsing push data as JSON. Falling back if text was available.', e);
          // If JSON parsing failed, use the text content if it was successfully read.
          if (receivedDataText !== 'N/A') {
            pushPayload.body = `Error parsing details. Content: ${receivedDataText.substring(0, 100)}`; // Use text if JSON fails
          }
    }
      } else {
        console.log('[SW] Push event data is null or undefined. Using default payload.');
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

  console.log('[SW] Attempting to show notification with Title:', `"${pushPayload.title}"`, 'Body:', `"${pushPayload.body}"`, 'Options:', notificationOptions);
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