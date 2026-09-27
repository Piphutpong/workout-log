/// <reference lib="webworker" />
// Service worker: cache ไฟล์แอป (ใช้ออฟไลน์ได้) + รับ Web Push
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Workout Log', {
      body: data.body,
      icon: 'pwa-192.png',
      badge: 'pwa-192.png',
      tag: data.tag,
      data: { url: data.url ?? './#/today' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? './'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = all.find((c) => 'focus' in c) as WindowClient | undefined
    if (existing) {
      await existing.navigate(url).catch(() => undefined)
      return existing.focus()
    }
    return self.clients.openWindow(url)
  })())
})
