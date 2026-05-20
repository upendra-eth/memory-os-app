import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { ReminderWrapper } from '@/components/reminder-wrapper'
import { PWAInstaller } from '@/components/pwa-installer'
import { QuestionsBell } from '@/components/questions-bell'
import './globals.css'

const geistSans = Geist({ 
  subsets: ['latin'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({ 
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Memory OS - Personal Data Intelligence',
  description: 'A schemaless personal data management system with AI-powered insights for health and fitness tracking',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Memory OS',
  },
  icons: {
    icon: [
      { url: '/icon-192x192.jpg', sizes: '192x192', type: 'image/jpeg' },
      { url: '/icon-512x512.jpg', sizes: '512x512', type: 'image/jpeg' },
    ],
    apple: '/apple-touch-icon.jpg',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#14b8a6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d9488' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased min-h-screen">
        <ReminderWrapper>{children}</ReminderWrapper>
        <QuestionsBell />
        <PWAInstaller />
        <Toaster position="top-center" richColors />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
