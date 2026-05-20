'use client'

import { useEffect, useState } from 'react'
import { AskInterface } from '@/components/ask-interface'
import { Spinner } from '@/components/ui/spinner'

export default function AskPage() {
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const email = localStorage.getItem('user_email')
    if (email) {
      // Get user ID from email (stored in onboarding)
      // For now, use email as identifier or fetch from Supabase
      setUserId(email)
      setLoading(false)
    } else {
      setLoading(false)
    }
  }, [])

  if (loading || !userId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">Ask Your Data</h1>
        <p className="text-sm text-muted-foreground">
          Search your life logs and get AI-powered insights
        </p>
      </div>
      <AskInterface userId={userId} />
    </div>
  )
}
