// Web Push handlers for the CryptoDUST service worker.
// Pulled into the generated Workbox SW via workbox.importScripts (vite.config.ts).

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'CryptoDUST', body: event.data.text() }
  }

  const title = payload.title || 'CryptoDUST'
  const options = {
    body: payload.body || '',
    // App identity (like "CoinGecko" in its own alerts)
    icon: '/cryptodust-logo.png',
    badge: '/favicon-32.png',
    // The coin's own logo, when provided, shows as the large image on Android
    image: payload.image || undefined,
    tag: payload.tag || 'cryptodust-alert', // replaces older alert for the same coin
    renotify: !!payload.renotify,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) {
          win.navigate(url)
          return win.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
