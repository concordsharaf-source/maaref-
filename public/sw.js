const CACHE_NAME = 'maaref-pwa-v5'
const CACHE_PREFIX = 'maaref-pwa-'
const scope = new URL(self.registration.scope)
const BASE_URL = scope.href
const BASE_PATH = scope.pathname.endsWith('/') ? scope.pathname : `${scope.pathname}/`
const CORE_ASSETS = [
  new URL('manifest.webmanifest', BASE_URL).href,
  new URL('maaref-mark.svg', BASE_URL).href,
  new URL('apple-touch-icon.png', BASE_URL).href,
  new URL('icons/icon-192.png', BASE_URL).href,
  new URL('icons/icon-512.png', BASE_URL).href,
  new URL('icons/icon-512-maskable.png', BASE_URL).href,
]

const cacheResponse = async (cache, request, response) => {
  if (response?.ok) await cache.put(request, response.clone())
  return response
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME)
  const shellResponse = await fetch(BASE_URL, { cache: 'reload' })
  if (!shellResponse.ok) throw new Error('Unable to cache Maaref app shell')

  const html = await shellResponse.clone().text()
  await cache.put(BASE_URL, shellResponse)

  // Vite fingerprints the JavaScript and CSS files. Reading them from the shell
  // lets the first installed version work offline without a second page load.
  const shellAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], BASE_URL))
    .filter((url) => url.origin === scope.origin && url.pathname.startsWith(BASE_PATH))
    .map((url) => url.href)

  const urls = [...new Set([...CORE_ASSETS, ...shellAssets])]
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { cache: 'reload' })
      await cacheResponse(cache, url, response)
    } catch {
      // A non-critical icon or asset should not prevent installation.
    }
  }))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) || key === 'maaref-shell-v2').map((key) => caches.delete(key)))
    if ('navigationPreload' in self.registration) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

async function networkFirst(event) {
  const { request } = event
  const cache = await caches.open(CACHE_NAME)
  try {
    const preloaded = await event.preloadResponse
    const response = preloaded || await fetch(request)
    return cacheResponse(cache, request, response)
  } catch {
    return (await caches.match(request)) || (await caches.match(BASE_URL)) || Response.error()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== scope.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event))
    return
  }

  const isAppAsset = url.pathname.startsWith(BASE_PATH) && (
    url.pathname.includes('/assets/') ||
    ['script', 'style', 'image', 'font', 'manifest', 'worker'].includes(request.destination)
  )

  if (isAppAsset) event.respondWith(cacheFirst(request))
})
