import { Navigation } from '@/components/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Database, MessageSquare, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { ProfilePromptCard } from '@/components/profile-prompt-card'

async function getStats() {
  const supabase = await createClient()
  
  // Auth check — get user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { totalLogs: 0, recentLogs: 0, lastUpdate: null }

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  // RLS will automatically scope these queries to the authenticated user
  const { count: totalLogs } = await supabase
    .from('life_logs')
    .select('*', { count: 'exact', head: true })
  
  const { count: recentLogs } = await supabase
    .from('life_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString())
  
  const { data: latestLog } = await supabase
    .from('life_logs')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  return {
    totalLogs: totalLogs ?? 0,
    recentLogs: recentLogs ?? 0,
    lastUpdate: latestLog?.created_at ?? null,
  }
}

export default async function DashboardPage() {
  const stats = await getStats()
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <header>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Your personal data intelligence at a glance</p>
          </header>

          {/* Daily Profile Prompt */}
          <ProfilePromptCard />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Total Logs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{stats.totalLogs}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  This Week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-accent">{stats.recentLogs}</p>
              </CardContent>
            </Card>

            <Card className="col-span-2 bg-gradient-to-br from-secondary to-secondary/50">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Last Update
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{formatDate(stats.lastUpdate)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Link href="/ingestor" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Activity className="h-6 w-6" />
                  </div>
                  <CardTitle>Paste Ingestor</CardTitle>
                  <CardDescription>
                    Paste JSON data from ChatGPT and store it in your personal database
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/chat" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <MessageSquare className="h-6 w-6" />
                  </div>
                  <CardTitle>Intelligence Chat</CardTitle>
                  <CardDescription>
                    Ask questions about your data and get AI-powered insights with visualizations
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/explorer" className="group">
              <Card className="h-full transition-all hover:shadow-lg hover:border-primary/50 hover:-translate-y-1">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Database className="h-6 w-6" />
                  </div>
                  <CardTitle>Raw Explorer</CardTitle>
                  <CardDescription>
                    Browse and inspect your raw JSON logs to verify saved data
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
