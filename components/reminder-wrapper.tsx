'use client'

import { useEffect, useState } from 'react'
import { DailyReminder } from '@/components/daily-reminder'
import { initializeDailyReminder } from '@/lib/notification-store'

export function ReminderWrapper({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    // Get user ID from localStorage (set during onboarding)
    const email = localStorage.getItem('user_email')
    if (email) {
      setUserId(email)
      // Initialize reminder if not already set
      initializeDailyReminder(email, '09:00')
    }
  }, [])

  return (
    <>
      {children}
      {userId && <DailyReminder userId={userId} />}
    </>
  )
}
