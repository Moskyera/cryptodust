/**
 * Web Push client helpers for CryptoDUST price alerts.
 *
 * The browser subscribes against our VAPID public key (public by design) and
 * the subscription + alert prefs are stored server-side via /api/push-subscribe.
 * The actual alerts are sent by /api/push-check on a cron.
 */

export const VAPID_PUBLIC_KEY =
  'BIgN2-PNohAGJuRoC1qaQE49H7XixKFzuxCJlR-YoK33n8XL8vN6GPL_UPwNrs8oyztN4YcvPuptQXzICUdEa2k'

export interface PushPrefs {
  threshold: number
  favorites: string[]
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Ask permission, subscribe the browser, and store it with the user's prefs. */
export async function enablePushAlerts(prefs: PushPrefs): Promise<'ok' | 'denied' | 'error'> {
  if (!isPushSupported()) return 'error'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const reg = await navigator.serviceWorker.ready
    const subscription =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    const res = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, prefs }),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function disablePushAlerts(): Promise<void> {
  const subscription = await getPushSubscription()
  if (!subscription) return

  try {
    await fetch('/api/push-subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  } catch {
    /* server cleanup is best-effort; the local unsubscribe below is what matters */
  }
  try {
    await subscription.unsubscribe()
  } catch {
    /* ignore */
  }
}

/** Keep server-side prefs in sync when favorites change (no permission prompt). */
export async function syncPushPrefs(prefs: PushPrefs): Promise<void> {
  const subscription = await getPushSubscription()
  if (!subscription) return
  try {
    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, prefs }),
    })
  } catch {
    /* next successful sync will catch up */
  }
}
