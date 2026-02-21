'use client'

import { useEffect } from 'react'

export default function ServiceWorkerCleanup() {
  useEffect(() => {
    // Forçar cleanup AGRESSIVO de qualquer cache que possa estar servindo JS antigo
    if (typeof window !== 'undefined') {
      console.log('[NUKE] Iniciando limpeza nuclear de cache...');
      
      // 1. Limpar Service Workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          if (registrations.length > 0) {
            console.log(`[NUKE] Removendo ${registrations.length} service workers...`);
            registrations.forEach(registration => {
              registration.unregister();
            });
          }
        }).catch(() => {});
      }
      
      // 2. Limpar Cache Storage
      if ('caches' in window) {
        caches.keys().then(cacheNames => {
          if (cacheNames.length > 0) {
            console.log(`[NUKE] Limpando ${cacheNames.length} caches:`, cacheNames);
            cacheNames.forEach(cacheName => {
              caches.delete(cacheName);
            });
          }
        }).catch(() => {});
      }
      
      // 3. Limpar localStorage específico do app
      const keysToRemove = ['lucrativo-processed-games', 'lucrativo-last-csv', 'lucrativo-cache-timestamp'];
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('[NUKE] localStorage limpo');
      
      // 4. Forçar reload com cache-buster
      const timestamp = Date.now();
      const currentUrl = window.location.href.split('?')[0];
      console.log('[NUKE] Forçando reload limpo...');
      window.location.replace(`${currentUrl}?v=${timestamp}`);
    }
  }, []);
  
  return null;
}
