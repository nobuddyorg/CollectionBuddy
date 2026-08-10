// A minimal service worker (#333): GitHub Pages cannot send cache headers
// of its own, so every visit re-validates roughly twenty content-hashed
// assets even though the hash already makes each one immutable -- a
// changed file gets a new name, never the same name with new bytes. This
// is the one lever left: cache-first, no revalidation ever needed, for
// `_next/static/**`; stale-while-revalidate for the app shell (the HTML
// documents and the manifest), so a deploy is picked up on the visit after
// this one rather than pinned forever.
//
// Everything else is left to the network untouched -- most importantly
// every Supabase request. PostgREST/Auth responses must never be served
// stale, and Storage's photograph URLs are signed with a one-hour expiry
// (see data/images.ts), so caching one by its own address would fill the
// cache with entries dead within the hour for no benefit. Those go to a
// different origin regardless, and this worker never touches a
// cross-origin request.

const CACHE_NAME = 'collectionbuddy-shell-v1';

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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    // Offline with nothing cached yet is the one case this can't cover --
    // there is no response to fall back to either way.
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('install', () => {
  // Takes over from a previous version immediately rather than waiting for
  // every open tab to close -- the assets it caches are addressed by
  // content hash, so an in-flight page never ends up with a mismatched mix.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // A GET is the only method either strategy below is safe to apply to --
  // this worker has no business intercepting a mutation.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHashedStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (isAppShellRequest(url.pathname, request.mode)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
