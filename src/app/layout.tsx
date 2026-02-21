import './globals.css'
import { Inter } from 'next/font/google'
import ClientLayout from './client-layout'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '⚽ LUCRATIVO',
  description: 'PackBall · favorito por AF · xG granular · score calibrado',
}

// Forçar sem cache em todas as rotas
export const revalidate = 0
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
