'use client'

import { useEffect, useState } from 'react'
import { getActiveDailyReminder, dismissDailyReminder } from '@/lib/notification-store'
import { Button } from '@/components/ui/button'
import { AlertCircle, X, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface DailyReminderProps {
  userId: string
}

export function DailyReminder({ userId }: DailyReminderProps) {
  const [shouldShow, setShouldShow] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Check on mount and every minute
    const check = () => {
      const result = getActiveDailyReminder(userId)
      setShouldShow(result.show)
    }

    check()

    // Recheck every minute
    const interval = setInterval(check, 60000)

    return () => clearInterval(interval)
  }, [userId])

  if (!mounted || !shouldShow) return null

  const handleDismiss = () => {
    dismissDailyReminder(userId)
    setShouldShow(false)
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-amber-50 border-2 border-amber-200 rounded-lg shadow-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 mb-1">Daily Log Reminder</h3>
          <p className="text-sm text-amber-800 mb-3">
            Don't forget to log today's entry! Click below to add your daily logs.
          </p>
          <div className="flex gap-2">
            <Link href="/add" className="flex-1">
              <Button
                size="sm"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="px-2"
              title="Dismiss for today"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
