// Inspection AI – service worker: installable app + screens open without internet.
// API calls (/api/...) are never cached: AI results and settings always come from the server.
const CACHE = 'inspection-ai-v6.2.0';
const SHELL = ['./', './index.html', './styles.css?v=6.2.0', './js/qr.js?v=6.2.0', './js/workspace.js?v=6.2.0', './js/demo-data.js?v=6.2.0',
  './js/media.js?v=6.2.0', './js/app.js?v=6.2.0', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg',
  './demo/images/site-base.jpg', './demo/images/site-elev.jpg', './demo/images/site-plat.jpg', './demo/images/site-ladder.jpg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  const cacheable = url.origin === location.origin || /upload\.wikimedia\.org|commons\.wikimedia\.org|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!cacheable) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
