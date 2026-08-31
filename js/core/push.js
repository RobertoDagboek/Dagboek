// Turning notifications on, and keeping the server able to reach this device.
//
// On an iPhone this only works when the app has been added to the Home Screen.
// In a Safari tab the browser will not even offer it - that is Apple's rule,
// not ours, so the settings screen says so plainly rather than failing quietly.

import { supa } from './supa.js';

// Safe to publish: it only lets a push be verified as coming from this app.
// The matching private key lives in the Supabase function's secrets.
const VAPID_PUBLIC = 'BCG45Vmar2V0sr_qMMO7fsPk2NDjuvTefUj77AhI7RyCsLluzladqXezT2ibsgvOqUj8FDmN33E34IWOUbIKfiw';

function urlB64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** Installed to the Home Screen? Push on iOS needs this. */
export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

export function isSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' */
export async function status() {
  if (!isSupported()) return 'unsupported';
  if (!isInstalled() && /iphone|ipad|ipod/i.test(navigator.userAgent)) return 'needs-install';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch { return 'off'; }
}

/** Ask, subscribe, and tell the server where to reach us. Needs a real tap. */
export async function enable() {
  if (!isSupported()) throw new Error('This browser cannot do notifications.');
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications were not allowed.');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToBytes(VAPID_PUBLIC),
    });

  const j = sub.toJSON();
  const { data: { user } } = await supa().auth.getUser();
  if (!user) throw new Error('Sign in first.');

  const { error } = await supa().from('push_subscriptions').upsert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: user.id,
  }, { onConflict: 'endpoint' });
  if (error) throw error;

  await supa().from('notify_state').upsert({
    user_id: user.id, enabled: true, tz_offset: -new Date().getTimezoneOffset(),
  }, { onConflict: 'user_id' });

  return true;
}

/** Stop this device being notified. Other devices are untouched. */
export async function disable() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supa().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch { /* already gone */ }
}

/**
 * Opening the app answers whatever was waiting, and resets the two-strike
 * count. Also carries the timezone, so 06:30 means 06:30 here.
 */
export async function markSeen() {
  try {
    await supa().rpc('mark_seen', { offset_mins: -new Date().getTimezoneOffset() });
  } catch { /* not signed in yet, or offline - it will go next time */ }
}

/** Mirror the two things the sender needs but that live in the browser. */
export async function syncPrefs({ todaySort, lastBriefing }) {
  try {
    const { data: { user } } = await supa().auth.getUser();
    if (!user) return;
    await supa().from('planner_prefs').upsert({
      user_id: user.id,
      today_sort: todaySort === 'priority' ? 'priority' : 'time',
      last_briefing: lastBriefing || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch { /* best effort */ }
}
