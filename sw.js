// Network-first for the app shell: you always get the newest version when
// online, and the last-known copy when you are not. Cross-origin calls
// (Supabase, OpenAI, the CDN) are never touched.

const CACHE = 'dagboek-v23';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './app.webmanifest',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/core/ui.js',
  './js/core/supa.js',
  './js/core/config.js',
  './js/core/crypto.js',
  './js/core/biometric.js',
  './js/planner/planner.js',
  './js/planner/tasks.js',
  './js/planner/briefing.js',
  './js/planner/priority.js',
  './js/planner/schedule.js',
  './js/core/push.js',
  './js/diary/diary.js',
  './js/diary/topics.js',
  './js/diary/quotes.js',
  './js/diary/recorder.js',
  './js/diary/transcribe.js',
  './js/diary/photos.js',
  './js/diary/video.js',
  './js/diary/exif.js',
  './js/diary/geo.js',
  './js/diary/reminders.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))),
  );
});

/* ===================== Notifications ===================== */
// A push arrives whether or not the app is open - this file is what runs.

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const title = d.title || 'Dagboek';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    // The tag groups by kind, so a second nudge replaces the first rather than
    // stacking up a column of them on the lock screen.
    tag: d.tag || 'dagboek',
    renotify: d.kind === 'task',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: d.url || './' },
    // Buttons are ignored by Safari on iOS, so tapping the body has to be
    // enough on its own - it opens straight to the task.
    actions: d.kind === 'task' ? [{ action: 'open', title: 'Open' }] : [],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse the window that is already open rather than piling up new ones.
    for (const c of all) {
      if (c.url.includes(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'notification', url });
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
