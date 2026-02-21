'use client'

import './globals.css'
import { Inter } from 'next/font/google'
import { useEffect } from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: '⚽ LUCRATIVO',
  description: 'PackBall · favorito por AF · xG granular · score calibrado',
}

function ServiceWorkerCleanup() {
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <ServiceWorkerCleanup />
        {children}
      </body>
    </html>
  )
}
