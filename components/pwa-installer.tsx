'use client'

import { useEffect } from 'react'
import { PWAInstallPrompt } from '@/components/pwa-install-prompt'

export function PWAInstaller() {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[v0] Service Worker registered:', registration)
        })
        .catch((error) => {
          console.error('[v0] Service Worker registration failed:', error)
        })
    }
  }, [])

  return <PWAInstallPrompt />
}
