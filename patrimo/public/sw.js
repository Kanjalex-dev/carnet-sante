/**
 * Service worker.
 *
 * Strategie deliberement conservatrice pour une application financiere :
 *
 *  - le code de l'application (JS, CSS, polices) est servi depuis le cache en
 *    priorite, parce qu'il est versionne et immuable ;
 *  - les DONNEES ne sont jamais servies depuis le cache. Afficher un solde
 *    perime sans le dire serait pire que d'afficher une erreur.
 *
 * Hors ligne, la navigation retombe sur une page dediee qui dit clairement que
 * les donnees ne sont pas a jour.
 */

const VERSION = 'patrimo-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|svg|webp)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Donnees : reseau uniquement. Jamais de solde perime servi en silence.
  if (url.pathname.startsWith('/api/')) return;

  // Ressources statiques versionnees : cache d'abord.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Navigation : reseau d'abord, page hors ligne en secours.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline').then((cached) =>
          cached ??
          new Response(
            '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>' +
              '<p style="font-family:system-ui;padding:2rem">Application hors ligne.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          ),
        ),
      ),
    );
  }
});
