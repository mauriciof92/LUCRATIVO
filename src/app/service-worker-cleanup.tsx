'use client'

import { useEffect } from 'react'

export default function ServiceWorkerCleanup() {
  useEffect(() => {
    // Forçar cleanup de service workers antigos que podem servir JS cacheado
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        if (registrations.length > 0) {
          console.log(`[SW] Limpando ${registrations.length} service workers antigos...`);
          const unregisterPromises = registrations.map(registration => {
            console.log('[SW] Unregistering:', registration.scope);
            return registration.unregister();
          });
          
          Promise.all(unregisterPromises).then(() => {
            console.log('[SW] Todos os service workers removidos. Forçando reload...');
            // Forçar reload limpo após remover SWs
            window.location.reload();
          }).catch(err => {
            console.warn('[SW] Erro ao remover service workers:', err);
          });
        }
      }).catch(err => {
        console.warn('[SW] Erro ao verificar service workers:', err);
      });
    }
  }, []);
  
  return null;
}
