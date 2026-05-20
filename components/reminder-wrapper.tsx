'use client'

import { useEffect, useState } from 'react'
import { DailyReminder } from '@/components/daily-reminder'
import { useAuth } from '@/components/auth-provider'
import { initializeDailyReminder } from '@/lib/notification-store'

export function ReminderWrapper({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (user?.email && !initialized) {
      // Initialize reminder if not already set
      initializeDailyReminder(user.email, '09:00')
      setInitialized(true)
    }
  }, [user, initialized])

  return (
    <>
      {children}
      {user?.email && <DailyReminder userId={user.email} />}
    </>
  )
}
