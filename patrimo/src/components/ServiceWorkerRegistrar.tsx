'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker.
 *
 * Fait cote client apres le montage, et non dans le HTML : sur iOS, un
 * enregistrement trop precoce entre en concurrence avec le chargement initial
 * et retarde l'affichage.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'development') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        console.error('[pwa] enregistrement du service worker en echec :', error);
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
