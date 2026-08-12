/**
 * Service Worker - KUOTAX PWA
 * Basic caching strategy untuk offline support
 */

const CACHE_NAME = 'kuotax-v1.0.2';
const OFFLINE_URL = '/offline.html';

// Assets yang di-cache saat install
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/images/logoa.png',
  '/css/style.css',
  '/icons/android-launchericon-72-72.png',
  '/icons/android-launchericon-144-144.png',
  '/icons/android-launchericon-512-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network Only (bypassing cache for real-time needs), fallback to offline page
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Always use network first to ensure real-time updates and fresh code
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // Only if network completely fails (user is offline) and they are trying to load a page
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        
        // For other assets when offline, return nothing to avoid breaking layout with wrong cached files
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
