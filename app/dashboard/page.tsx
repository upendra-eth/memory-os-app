'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { ProfilePromptCard } from '@/components/profile-prompt-card'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { calculateBMR, calculateTDEE } from '@/lib/health-metrics'
import type { ExtractedJSON } from '@/lib/extraction-schema'
import {
  Flame,
  Beef,
  Moon,
  Smile,
  Dumbbell,
  Scale,
  TrendingDown,
  TrendingUp,
  Minus,
  Plus,
  UserCircle,
  ArrowRight,
  Sparkles,
  HeartPulse,
  Stethoscope,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'

type Range = '7d' | '30d' | '90d'

interface DayRow {
  date: string
  iso?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  sleep_hours?: number
  sleep_quality?: number
  mood_score?: number
  stress_level?: number
  workouts?: number
  workout_min?: number
}

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 }

export default function DashboardPage() {
  const { profileId, user, isLoading: authLoading } = useAuth()
  const [range, setRange] = useState<Range>('7d')
  const [rows, setRows] = useState<DayRow[]>([])
  const [tdee, setTdee] = useState<number | null>(null)
  const [latest, setLatest] = useState<ExtractedJSON | null>(null)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [latestReport, setLatestReport] = useState<{ name: string; date: string } | null>(null)
  const [activeIssues, setActiveIssues] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    const load = async () => {
      setIsLoading(true)
      try {
        if (!profileId) return
        const supabase = createClient()

        // Profile → TDEE target
        const { data: profile } = await supabase
          .from('user_profile')
          .select('*')
          .eq('id', profileId)
          .single()

        const profileReady = !!(profile?.current_weight_kg && profile?.height_cm && profile?.gender)
        setNeedsProfile(!profileReady)

        if (profileReady) {
          const age =
            profile.dob && typeof profile.dob === 'string'
              ? new Date().getFullYear() - parseInt(profile.dob.split('-')[0])
              : profile.age || 30
          if (age > 0) {
            const bmr = calculateBMR(profile.current_weight_kg, profile.height_cm, age, profile.gender)
            setTdee(calculateTDEE(bmr, profile.activity_level || 'moderate'))
          }
        }

        // Trend rows from daily_aggregates
        const start = new Date()
        start.setDate(start.getDate() - RANGE_DAYS[range])
        const { data: aggs } = await supabase
          .from('daily_aggregates')
          .select('*')
          .eq('user_id', profileId)
          .gte('log_date', start.toISOString().split('T')[0])
          .order('log_date', { ascending: true })

        setRows(
          (aggs || []).map((a: any) => ({
            date: new Date(a.log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            iso: a.log_date as string,
            calories: a.calories ?? undefined,
            protein: a.protein_g ?? undefined,
            carbs: a.carbs_g ?? undefined,
            fat: a.fat_g ?? undefined,
            sleep_hours: a.sleep_hours ?? undefined,
            sleep_quality: a.sleep_quality ?? undefined,
            mood_score: a.mood_score ?? undefined,
            stress_level: a.stress_level ?? undefined,
            workouts: a.workouts_count ?? undefined,
            workout_min: a.workout_duration_min ?? undefined,
          }))
        )

        // Latest entry → today snapshot (energy balance, etc.)
        const { data: latestEntry } = await supabase
          .from('entries')
          .select('extracted_json')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        setLatest((latestEntry?.extracted_json as ExtractedJSON) ?? null)

        // Health hub: latest report + count of unresolved issues
        const { data: reportRow } = await supabase
          .from('lab_results')
          .select('test_name, test_date')
          .eq('user_id', profileId)
          .order('test_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        setLatestReport(reportRow ? { name: reportRow.test_name || 'Report', date: reportRow.test_date } : null)

        const { count: issuesCount } = await supabase
          .from('health_issues')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profileId)
          .neq('status', 'resolved')
        setActiveIssues(issuesCount ?? 0)
      } catch (e) {
        console.error('[v0] dashboard load error:', e)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [range, profileId, authLoading])

  const today = rows[rows.length - 1]
  const eb = latest?.energy_balance
  const totals = latest?.daily_totals
  const hasData = rows.length > 0 || latest != null
  const todayIso = new Date().toISOString().split('T')[0]
  const isToday = today?.iso === todayIso
  const snapshotLabel = !today ? 'Today' : isToday ? 'Today' : `Latest · ${today.date}`

  const avg = (key: keyof DayRow) => {
    const vals = rows.map((r) => r[key] as number | undefined).filter((v): v is number => typeof v === 'number')
    if (vals.length === 0) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }
  const totalWorkouts = rows.reduce((s, r) => s + (r.workouts || 0), 0)
  const daysLogged = rows.length

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <Spinner />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              {hasData ? 'Your snapshot and trends' : 'Log an entry to see your insights'}
            </p>
          </header>

          {/* Daily profile prompt notification */}
          <ProfilePromptCard />

          {/* Health hub summary — only shows once there's something to show */}
          {(latestReport || activeIssues > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/issues">
                <Card className="p-4 flex items-center gap-3 hover:bg-secondary/50 transition-colors h-full">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 flex-shrink-0">
                    <HeartPulse className="h-4 w-4" />
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{activeIssues > 0 ? `${activeIssues} active issue${activeIssues > 1 ? 's' : ''}` : 'No active issues'}</p>
                    <p className="text-xs text-muted-foreground">Track pain, posture, hair fall & more</p>
                  </div>
                </Card>
              </Link>
              <Link href="/lab-reports">
                <Card className="p-4 flex items-center gap-3 hover:bg-secondary/50 transition-colors h-full">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary flex-shrink-0">
                    <Stethoscope className="h-4 w-4" />
                  </div>
                  <div className="text-sm min-w-0">
                    <p className="font-medium truncate">{latestReport ? latestReport.name : 'No reports yet'}</p>
                    <p className="text-xs text-muted-foreground">
                      {latestReport ? `Latest report · ${new Date(latestReport.date).toLocaleDateString('en-IN')}` : 'Labs, checkups & body scans'}
                    </p>
                  </div>
                </Card>
              </Link>
            </div>
          )}

          {!hasData ? (
            <FirstRunEmptyState needsProfile={needsProfile} />
          ) : (
          <>
          {/* Finish-profile nudge: targets/TDEE need these fields */}
          {needsProfile && (
            <Link href="/profile">
              <Card className="p-4 flex items-center gap-3 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors">
                <UserCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium">Finish your profile</span>
                  <span className="text-muted-foreground"> — add weight, height & sex to unlock calorie targets (TDEE) and energy balance.</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Card>
            </Link>
          )}

          {/* ---- TODAY / LATEST SNAPSHOT ---- */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">{snapshotLabel}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <SnapshotCard
                icon={<Flame className="h-4 w-4" />}
                label="Calories"
                value={totals?.kcal ?? today?.calories}
                suffix={tdee ? ` / ${tdee}` : ''}
                tint="orange"
              />
              <SnapshotCard
                icon={<Beef className="h-4 w-4" />}
                label="Protein"
                value={totals?.protein_g ?? today?.protein}
                suffix="g"
                tint="blue"
              />
              <SnapshotCard
                icon={<Moon className="h-4 w-4" />}
                label="Sleep"
                value={today?.sleep_hours}
                suffix="h"
                tint="violet"
              />
              <SnapshotCard
                icon={<Smile className="h-4 w-4" />}
                label="Mood"
                value={today?.mood_score}
                suffix="/10"
                tint="emerald"
              />
              <SnapshotCard
                icon={<Dumbbell className="h-4 w-4" />}
                label="Training"
                value={today?.workout_min}
                suffix="m"
                tint="cyan"
              />
              <EnergyBalanceCard eb={eb} />
            </div>
          </section>

          {/* ---- RANGE SELECTOR ---- */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Trends</h2>
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList>
                <TabsTrigger value="7d">Week</TabsTrigger>
                <TabsTrigger value="30d">Month</TabsTrigger>
                <TabsTrigger value="90d">Quarter</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {rows.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No data in this range yet. Add an entry to start building your trends.
            </Card>
          ) : (
            <>
              {/* Period summary strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatPill label="Days logged" value={`${daysLogged}`} />
                <StatPill label="Avg calories" value={fmt(avg('calories'), ' kcal')} />
                <StatPill label="Avg protein" value={fmt(avg('protein'), 'g')} />
                <StatPill label="Workouts" value={`${totalWorkouts}`} />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title={`Calories vs TDEE${tdee ? ` (${tdee})` : ''}`}>
                  <ComposedChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="calories" fill="#f59e0b" name="Calories" radius={[4, 4, 0, 0]} />
                    {tdee && <ReferenceLine y={tdee} stroke="#06b6d4" strokeDasharray="4 4" label="TDEE" />}
                  </ComposedChart>
                </ChartCard>

                <ChartCard title="Macros (g)">
                  <AreaChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="protein" stackId="1" stroke="#3b82f6" fill="#3b82f6" name="Protein" />
                    <Area type="monotone" dataKey="carbs" stackId="1" stroke="#f59e0b" fill="#f59e0b" name="Carbs" />
                    <Area type="monotone" dataKey="fat" stackId="1" stroke="#ef4444" fill="#ef4444" name="Fat" />
                  </AreaChart>
                </ChartCard>

                <ChartCard title="Sleep">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sleep_hours" stroke="#8b5cf6" name="Hours" dot={false} />
                    <Line type="monotone" dataKey="sleep_quality" stroke="#a78bfa" name="Quality" dot={false} />
                  </LineChart>
                </ChartCard>

                <ChartCard title="Mood & Stress">
                  <LineChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis domain={[0, 10]} fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="mood_score" stroke="#10b981" name="Mood" dot={false} />
                    <Line type="monotone" dataKey="stress_level" stroke="#ef4444" name="Stress" dot={false} />
                  </LineChart>
                </ChartCard>

                <ChartCard title="Training volume" className="lg:col-span-2">
                  <BarChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="workout_min" fill="#14b8a6" name="Minutes" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartCard>
              </div>
            </>
          )}
          </>
          )}
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------

function fmt(v: number | null, suffix = ''): string {
  if (v === null) return '—'
  return `${Math.round(v)}${suffix}`
}

function FirstRunEmptyState({ needsProfile }: { needsProfile: boolean }) {
  return (
    <Card className="p-8 md:p-12 text-center space-y-6">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
        <Sparkles className="h-7 w-7" />
      </div>
      <div className="space-y-1.5 max-w-md mx-auto">
        <h2 className="text-xl font-semibold">Welcome to Memory OS</h2>
        <p className="text-sm text-muted-foreground">
          Log your day once and your snapshot, trends, training and insights fill in automatically.
          {needsProfile && ' Add a few profile details so calorie targets and energy balance work.'}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/add">
          <Button size="lg" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1.5" /> Add your first entry
          </Button>
        </Link>
        {needsProfile && (
          <Link href="/profile">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <UserCircle className="h-4 w-4 mr-1.5" /> Complete profile
            </Button>
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Not sure what to paste? Open <span className="font-medium">Add Entry</span> and hit “Load example”.
      </p>
    </Card>
  )
}

const TINTS: Record<string, string> = {
  orange: 'text-orange-600 bg-orange-500/10',
  blue: 'text-blue-600 bg-blue-500/10',
  violet: 'text-violet-600 bg-violet-500/10',
  emerald: 'text-emerald-600 bg-emerald-500/10',
  cyan: 'text-cyan-600 bg-cyan-500/10',
}

function SnapshotCard({
  icon,
  label,
  value,
  suffix = '',
  tint,
}: {
  icon: React.ReactNode
  label: string
  value?: number | null
  suffix?: string
  tint: string
}) {
  const has = typeof value === 'number'
  return (
    <Card className="p-3">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg mb-2 ${TINTS[tint]}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">
        {has ? Math.round(value as number) : '—'}
        {has && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </Card>
  )
}

function EnergyBalanceCard({ eb }: { eb?: ExtractedJSON['energy_balance'] }) {
  const status = eb?.status
  const balance = eb?.balance_kcal
  const Icon = status === 'deficit' ? TrendingDown : status === 'surplus' ? TrendingUp : Minus
  const tint =
    status === 'deficit'
      ? 'text-emerald-600 bg-emerald-500/10'
      : status === 'surplus'
        ? 'text-orange-600 bg-orange-500/10'
        : 'text-muted-foreground bg-muted'
  return (
    <Card className="p-3">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg mb-2 ${tint}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Scale className="h-3 w-3" /> Balance
      </p>
      <p className="text-lg font-bold tabular-nums capitalize">
        {status ?? '—'}
        {typeof balance === 'number' && (
          <span className="text-xs font-normal text-muted-foreground"> {balance > 0 ? '+' : ''}{balance}</span>
        )}
      </p>
    </Card>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </Card>
  )
}

function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactElement
  className?: string
}) {
  return (
    <Card className={`p-5 ${className}`}>
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        {children}
      </ResponsiveContainer>
    </Card>
  )
}
