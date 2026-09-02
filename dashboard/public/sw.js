// Lumiox Service Worker v3 – Code IMMER frisch vom Server, Cache nur als Fallback
const CACHE = 'lumiox-v6';
const KERN = ['/', '/index.html', '/login.html', '/setup.html',
  '/css/glass.css', '/js/api.js', '/js/design.js', '/js/app.js', '/js/umlage.js', '', '/img/logo.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(KERN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  const istCode = /\.(js|css|html|webmanifest)$/.test(url.pathname) || url.pathname === '/';
  if (istCode) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return res;
      }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit ||
      fetch(e.request).then((res) => {
        const kopie = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return res;
      }).catch(() => caches.match('/index.html'))));
});
