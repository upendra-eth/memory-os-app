'use client'

import { useAuth } from '@/components/auth-provider'
import { AskInterface } from '@/components/ask-interface'
import { Spinner } from '@/components/ui/spinner'

export default function AskPage() {
  const { user, profileId, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Please sign in to use Ask mode.</p>
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
      <AskInterface userId={profileId || ''} />
    </div>
  )
}
