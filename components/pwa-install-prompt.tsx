'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Download, X } from 'lucide-react'

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event for later use.
      setDeferredPrompt(e)
      // Update UI to show install button
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    const promptEvent = deferredPrompt as any
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice

    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setShowPrompt(false)
    }
  }

  if (!showPrompt) return null

  return (
    <div className="fixed top-4 left-4 right-4 z-40 md:max-w-md md:left-auto">
      <Card className="p-4 bg-primary text-primary-foreground shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <Download className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-sm">Install Memory OS</h3>
              <p className="text-xs opacity-90 mt-1">Add to your home screen for quick access</p>
            </div>
          </div>
          <button
            onClick={() => setShowPrompt(false)}
            className="p-1 hover:bg-primary/80 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-4">
          <Button
            size="sm"
            onClick={handleInstall}
            className="bg-white text-primary hover:bg-gray-100"
          >
            Install
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowPrompt(false)}
            className="text-primary-foreground hover:bg-primary/80"
          >
            Maybe later
          </Button>
        </div>
      </Card>
    </div>
  )
}
