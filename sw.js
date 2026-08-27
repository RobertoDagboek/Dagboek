// Network-first for the app shell: you always get the newest version when
// online, and the last-known copy when you are not. Cross-origin calls
// (Supabase, OpenAI, the CDN) are never touched.

const CACHE = 'dagboek-v14';
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
