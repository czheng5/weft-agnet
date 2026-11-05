export const PWA_MANIFEST = JSON.stringify({
  name: 'Weft Surface',
  short_name: 'Weft',
  description: 'Durable agent control plane',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#07111f',
  theme_color: '#0b1020',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
}, null, 2);

export const PWA_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="#07111f"/>
  <path d="M38 62l24 70 20-48 20 48 24-70" fill="none" stroke="#5eead4" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="150" cy="42" r="10" fill="#22d3ee"/>
</svg>`;

export const PWA_SERVICE_WORKER = `const CACHE = 'weft-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))));
});
`;
