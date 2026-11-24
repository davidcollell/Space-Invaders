const CACHE = 'space-invaders-v3'
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('space-invaders-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)

  // Només gestionem peticions GET del mateix domini.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Les navegacions prioritzen la versió més recent i recorren a la còpia
  // local quan no hi ha connexió.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(
              caches.open(CACHE).then(cache => cache.put('/index.html', copy))
            )
          }
          return response
        })
        .catch(async () => {
          return (await caches.match('/index.html')) || (await caches.match('/'))
        })
    )
    return
  }

  // Els recursos locals (JavaScript, CSS, icones...) es serveixen des de
  // memòria cau quan ja s'han descarregat, i es guarden en la primera visita.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached

      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          event.waitUntil(
            caches.open(CACHE).then(cache => cache.put(request, copy))
          )
        }
        return response
      })
    })
  )
})
