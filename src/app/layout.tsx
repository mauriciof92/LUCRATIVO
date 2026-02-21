import './globals.css'
import { Inter } from 'next/font/google'
import ServiceWorkerCleanup from './service-worker-cleanup'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: '⚽ LUCRATIVO',
  description: 'PackBall · favorito por AF · xG granular · score calibrado',
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
