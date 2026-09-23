/* Inkhall — Service Worker
   改完应用后，把 CACHE 的版本号升一位，用户的页面就会弹「发现新版本」。 */
const CACHE = 'inkhall-v2';
const SHELL = ['./', './index.html', './manifest.json',
  './icons/favicon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* 逐个用 cache:'reload' 抓：直接 caches.addAll 会走【旧】SW 的 fetch 处理器，
       把旧 index.html 存进新缓存，离线时才暴露。 */
    await Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' })
      .then(r => (r && r.ok ? c.put(u, r) : null)).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch (err) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  /* ⚠ 绝不能碰跨域请求：AI 接口、模型列表都在外面，拦了就会坏 */
  if (url.origin !== self.location.origin) return;

  const isDoc = req.mode === 'navigate' || /\/(index\.html|manifest\.json|sw\.js)$/.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isDoc) {
      /* 文档与清单永远先要网络：不然用户永远拿不到新版本 */
      try {
        const r = await fetch(req);
        if (r && r.ok) cache.put(req, r.clone());
        return r;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
      }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && r.ok) cache.put(req, r.clone());
      return r;
    } catch (err) {
      return Response.error();
    }
  })());
});
