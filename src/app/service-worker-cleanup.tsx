'use client'

import { useEffect } from 'react'

export default function ServiceWorkerCleanup() {
  useEffect(() => {
    // Rodar cleanup apenas se não tiver sido executado antes (verificar flag)
    if (typeof window !== 'undefined') {
      const cleanupFlag = 'lucrativo-nuke-done';
      
      // Se já fez cleanup, não fazer novamente
      if (sessionStorage.getItem(cleanupFlag)) {
        console.log('[NUKE] Cleanup já executado nesta sessão');
        return;
      }
      
      console.log('[NUKE] Iniciando limpeza nuclear de cache...');
      
      // Marcar que vai fazer cleanup para evitar loop
      sessionStorage.setItem(cleanupFlag, 'true');
      
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
      
      // 4. Forçar reload apenas se não tiver timestamp na URL
      const urlParams = new URLSearchParams(window.location.search);
      if (!urlParams.has('v')) {
        const timestamp = Date.now();
        const currentUrl = window.location.href.split('?')[0];
        console.log('[NUKE] Forçando reload com timestamp...');
        window.location.replace(`${currentUrl}?v=${timestamp}`);
      } else {
        console.log('[NUKE] URL já tem timestamp, cleanup completo');
      }
    }
  }, []);
  
  return null;
}
