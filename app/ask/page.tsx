'use client'

import { useAuth } from '@/components/auth-provider'
import { Navigation } from '@/components/navigation'
import { AskInterface } from '@/components/ask-interface'
import { Spinner } from '@/components/ui/spinner'
import { Sparkles } from 'lucide-react'

export default function AskPage() {
  const { user, profileId, isLoading } = useAuth()

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 flex flex-col md:h-screen min-h-0">
        <div className="border-b px-6 py-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ask Your Data</h1>
            <p className="text-sm text-muted-foreground">
              Chat with your memory — every entry you&apos;ve logged is searched to answer you.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner />
          </div>
        ) : !user ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Please sign in to use Ask mode.</p>
          </div>
        ) : (
          // min-h-0 lets the chat's internal overflow-y-auto actually scroll
          // inside the flex column. pb on mobile clears the fixed bottom nav.
          <div className="flex-1 min-h-0 pb-16 md:pb-0">
            <AskInterface userId={profileId || ''} />
          </div>
        )}
      </main>
    </div>
  )
}
