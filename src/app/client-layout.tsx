'use client'

import ServiceWorkerCleanup from './service-worker-cleanup'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerCleanup />
      {children}
    </>
  )
}
