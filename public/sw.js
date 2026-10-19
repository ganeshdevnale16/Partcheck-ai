// Inspection AI demo – service worker: installable app + screens open without internet.
const CACHE = 'inspection-ai-demo-v5.2.0';
const SHELL = ['./', './index.html', './styles.css?v=5.2.0', './js/qr.js?v=5.2.0', './js/demo-data.js?v=5.2.0', './js/media.js?v=5.2.0', './js/app.js?v=5.2.0',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
// Network first, cache as fallback. Demo photos, fonts and the QR library are cached too, so a demo works offline once loaded.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const cacheable = url.origin === location.origin || /upload\.wikimedia\.org|commons\.wikimedia\.org|fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.host);
  if (!cacheable) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
