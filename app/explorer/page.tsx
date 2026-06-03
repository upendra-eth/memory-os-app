import { Navigation } from '@/components/navigation'
import { LogExplorer } from '@/components/log-explorer'
import { createClient } from '@/lib/supabase/server'

import { getAllLogs } from '@/app/actions'

export default async function ExplorerPage() {
  const { logs, total } = await getAllLogs()

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Raw Explorer</h1>
              <p className="text-muted-foreground mt-1">
                Browse and inspect your raw JSON logs ({total} total)
              </p>
            </div>
          </header>
          
          <LogExplorer initialLogs={logs} total={total} />
        </div>
      </main>
    </div>
  )
}
