// Bump the version when the list changes; the old cache is dropped on activate.
const CACHE = 'guitar-simulator-v5';

// Every file the page can ask for, so it runs offline after one visit. test/pwa.test.js keeps the
// list equal to what is on disk.
const SHELL = [
  './',
  'styles.css',
  'manifest.webmanifest',
  'src/audio.js',
  'src/credit.js',
  'src/edit-rules.js',
  'src/editor-grid.js',
  'src/editor-text.js',
  'src/examples-dialog.js',
  'src/examples.js',
  'src/files.js',
  'src/guitar.js',
  'src/history.js',
  'src/icons.js',
  'src/main.js',
  'src/offline.js',
  'src/pitch.js',
  'src/pluck.js',
  'src/print.js',
  'src/scheduler.js',
  'src/song-fields.js',
  'src/stage-fit.js',
  'src/storage.js',
  'src/tab-panel.js',
  'src/volume.js',
  'src/tab.js',
  'songs/guitar-chords.js',
  'songs/index.js',
  'songs/minueto-op1-1.js',
  'songs/minueto-op1-2.js',
  'songs/minueto-op1-3.js',
  'songs/rondo-alla-turca.js',
  'songs/technique-study.js',
  'assets/icon/apple-touch-icon.png',
  'assets/icon/favicon-32.png',
  'assets/icon/favicon.svg',
  'assets/icon/icon-192.png',
  'assets/icon/icon-512.png',
  'assets/icon/icon-maskable-512.png',
  'assets/icon/icon-maskable.svg',
  'assets/icon/icon.svg',
  'assets/icon/share.png',
  'assets/linkedin/InBug-Black.png',
  'assets/linkedin/InBug-White.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Network first: online, every file is as fresh as the server's, so an edit never hides behind a
// cached copy; offline, the last copy seen. A page address with nothing cached gets the app itself.
const respond = async (request) => {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request, { ignoreSearch: true }))
      ?? (request.mode === 'navigate' ? await cache.match('./') : undefined);
    if (cached) return cached;
    throw error;
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
