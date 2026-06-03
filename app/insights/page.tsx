'use client'

import { useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { HabitsView } from '@/components/insights/habits-view'
import { CorrelationsView } from '@/components/insights/correlations-view'
import { MindView } from '@/components/insights/mind-view'
import { ReviewView } from '@/components/insights/review-view'

export default function InsightsPage() {
  // Track which tabs have been opened so each view mounts (and fetches) lazily.
  const [seen, setSeen] = useState<Record<string, boolean>>({ habits: true })

  const markSeen = (tab: string) => setSeen((s) => (s[tab] ? s : { ...s, [tab]: true }))

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
            <p className="text-muted-foreground mt-1">Patterns and reflections drawn from everything you log</p>
          </header>

          <Tabs defaultValue="habits" onValueChange={markSeen}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="habits">Habits</TabsTrigger>
              <TabsTrigger value="correlations">Patterns</TabsTrigger>
              <TabsTrigger value="mind">Mind</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>

            <TabsContent value="habits" className="mt-6">
              {seen.habits && <HabitsView />}
            </TabsContent>
            <TabsContent value="correlations" className="mt-6">
              {seen.correlations && <CorrelationsView />}
            </TabsContent>
            <TabsContent value="mind" className="mt-6">
              {seen.mind && <MindView />}
            </TabsContent>
            <TabsContent value="review" className="mt-6">
              {seen.review && <ReviewView />}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
