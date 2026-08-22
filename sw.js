/* ============================================================
   TNR · Service Worker (PWA)
   - Cachea el shell para que la app abra offline.
   - Recibe notificaciones push (cuando se configure el enviador).
   ============================================================ */
const CACHE = 'tnr-cache-v34';
const ASSETS = [
  './', './index.html',
  './styles.css?v=34', './icons.js?v=34', './config.js?v=34', './auth.js?v=34',
  './data.js?v=34', './sistema.js?v=34', './recordatorios.js?v=34', './parser.js?v=34',
  './so-vista.js?v=34', './app.js?v=34',
  './logo.png', './logo.svg', './favicon.png', './apple-touch-icon.png', './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network-first para contenido propio; la nube (Supabase) y fuentes pasan directo.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // no tocar Supabase/CDN
  e.respondWith(
    fetch(req).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});

// Notificación push (payload JSON: {title, body, url})
self.addEventListener('push', (e) => {
  let d = { title: 'TNR · Sistema Operativo', body: 'Tenés alertas pendientes', url: './' };
  try { if (e.data) d = Object.assign(d, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: 'favicon.png', badge: 'favicon.png',
    // La etiqueta la decide quien manda el aviso. Es lo que hace que si el
    // mismo recordatorio llega por los dos caminos (el navegador con la app
    // abierta y el servidor con la app cerrada), el celular muestre UNO solo
    // en vez de dos: mismo tag = se reemplaza, no se apila.
    data: { url: d.url || './' }, vibrate: [80, 40, 80], tag: d.tag || 'tnr-push',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.focus(); return; } }
    return clients.openWindow(url);
  }));
});
