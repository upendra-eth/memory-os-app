// Service Worker for Memory OS PWA
//
// Deliberately minimal. The previous version intercepted EVERY GET (including
// Supabase API calls and Next.js RSC payloads), re-fetched each one, and cached
// it — which doubled every request, cached private user data, and slowed
// navigation. This version only:
//   • cache-first serves immutable static assets (/_next/static, icons)
//   • network-first serves page navigations (with an offline cache fallback)
//   • ignores everything else (API, cross-origin Supabase/Gemini, RSC, non-GET)
//     by NOT calling respondWith — the browser handles them normally, with no
//     duplicate SW request.
const CACHE = 'memory-os-v2'
const APP_SHELL = ['/dashboard', '/add', '/workout', '/timeline', '/ask', '/profile']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/apple-touch-icon') ||
    url.pathname === '/favicon.ico' ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|gif|webp)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Only ever touch our own origin — let Supabase, Gemini, analytics pass through.
  if (url.origin !== self.location.origin) return
  // Never intercept API routes or Next.js RSC/data fetches (keeps data fresh + private).
  if (url.pathname.startsWith('/api/')) return
  if (url.searchParams.has('_rsc')) return

  // Static assets → cache-first (they're content-hashed / immutable).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Page navigations → network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/dashboard'))),
    )
    return
  }

  // Everything else: do nothing → browser handles it (no duplicate SW request).
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})
