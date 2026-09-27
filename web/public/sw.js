// Cache-first for hashed `_next/static/**`, network-first for the app shell, one cache per build (docs/reference/architecture.md).

const CACHE_PREFIX = 'collectionbuddy-';

// Each build registers `sw.js?build=<id>`; an old build's HTML still registers plain `sw.js`.
function cacheNameFor(search) {
  const build = new URLSearchParams(search).get('build') ?? 'unversioned';
  return `${CACHE_PREFIX}${build}`;
}

const CACHE_NAME = cacheNameFor(self.location.search);

// The prefix spares other sites' caches: every project page of an account shares one github.io origin.
function isStaleCache(key, current) {
  return key.startsWith(CACHE_PREFIX) && key !== current;
}

function isHashedStaticAsset(pathname) {
  return pathname.includes('/_next/static/');
}

function isAppShellRequest(pathname, mode) {
  return mode === 'navigate' || pathname.endsWith('/site.webmanifest');
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Offline: the last shell this build served, so the app still opens.
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', () => {
  // Pages already serves only the new build, so waiting for old tabs to close protects nothing.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => isStaleCache(key, CACHE_NAME))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // A GET is the only method either strategy below is safe to apply to.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHashedStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (isAppShellRequest(url.pathname, request.mode)) {
    event.respondWith(networkFirst(request));
  }
});
