'use client'

import { useEffect, useState, useCallback } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import { generateDailyBrief, getProfileCity, saveCity, type DailyBrief } from '@/app/discover-actions'
import { Compass, RefreshCw, MapPin, Sparkles, CheckCircle2, Apple, Lightbulb } from 'lucide-react'

const TOPIC_TINT: Record<string, string> = {
  personal_growth: 'bg-violet-500/10 text-violet-600',
  health: 'bg-emerald-500/10 text-emerald-600',
  time_management: 'bg-amber-500/10 text-amber-600',
}

const todayKey = () => new Date().toISOString().slice(0, 10)

export default function DiscoverPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [city, setCity] = useState<string | null>(null)
  const [cityInput, setCityInput] = useState('')
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  const cacheKey = (c: string | null) => `discover:${todayKey()}:${c || 'na'}`

  const load = useCallback(async (c: string | null, force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey(c))
        if (cached) {
          setBrief(JSON.parse(cached))
          setLoading(false)
          return
        }
      } catch {}
    }
    setGenerating(true)
    const res = await generateDailyBrief(c || undefined)
    setGenerating(false)
    setLoading(false)
    if (res.success && res.brief) {
      setBrief(res.brief)
      try {
        localStorage.setItem(cacheKey(c), JSON.stringify(res.brief))
      } catch {}
    } else {
      toast({ title: 'Error', description: res.error || 'Failed to load.', variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    getProfileCity().then((c) => {
      setCity(c)
      load(c)
    })
  }, [authLoading, user, load])

  const handleSaveCity = async () => {
    const c = cityInput.trim()
    if (!c) return
    await saveCity(c)
    setCity(c)
    toast({ title: 'Saved', description: `Food picks will be tailored to ${c}.` })
    load(c, true)
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25 animate-float">
                <Compass className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
                <p className="text-muted-foreground mt-0.5 text-sm">A fresh daily brief on growth, health & time — plus a food worth trying.</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(city, true)}
              disabled={generating}
              className="flex-shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline ml-1.5">New</span>
            </Button>
          </header>

          {/* City capture */}
          <Card className="p-3 flex flex-wrap items-center gap-2">
            <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
            {city ? (
              <span className="text-sm">
                Food picks tailored to <span className="font-medium">{city}</span>.
                <button className="text-primary hover:underline ml-2 text-xs" onClick={() => setCity(null)}>change</button>
              </span>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Set your city for local, seasonal food picks:</span>
                <Input
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCity()}
                  placeholder="e.g. Bengaluru"
                  className="h-8 w-40 text-sm"
                />
                <Button size="sm" className="h-8" onClick={handleSaveCity} disabled={!cityInput.trim()}>Save</Button>
              </div>
            )}
          </Card>

          {loading || generating ? (
            <Card className="p-10 flex flex-col items-center justify-center gap-3 text-center">
              <Spinner />
              <p className="text-sm text-muted-foreground">{generating ? 'Curating today’s brief…' : 'Loading…'}</p>
            </Card>
          ) : !brief ? (
            <Card className="p-10 text-center text-muted-foreground">
              Couldn’t load today’s brief. <button className="text-primary hover:underline" onClick={() => load(city, true)}>Try again</button>.
            </Card>
          ) : (
            <div className="space-y-5 stagger">
              {/* Article */}
              <Card className="p-6 space-y-4">
                <Badge className={`${TOPIC_TINT[brief.topic] || ''} capitalize`} variant="secondary">
                  <Sparkles className="h-3 w-3 mr-1" /> {brief.topic_label}
                </Badge>
                <h2 className="text-2xl font-bold tracking-tight">{brief.title}</h2>
                <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-line">{brief.article}</p>

                {brief.takeaways.length > 0 && (
                  <ul className="space-y-1.5 pt-1">
                    {brief.takeaways.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {brief.micro_action && (
                  <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><span className="font-medium">Try today: </span>{brief.micro_action}</span>
                  </div>
                )}
              </Card>

              {/* Food discovery */}
              {brief.food.name && (
                <Card className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Apple className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Food to discover</p>
                      <h3 className="font-semibold leading-tight">{brief.food.name}</h3>
                    </div>
                  </div>
                  {brief.food.why && <p className="text-sm text-foreground/90">{brief.food.why}</p>}
                  {brief.food.local_note && (
                    <p className="text-sm text-muted-foreground flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />{brief.food.local_note}
                    </p>
                  )}
                  {brief.food.how_to_use && (
                    <p className="text-sm"><span className="font-medium">How to eat it: </span>{brief.food.how_to_use}</p>
                  )}
                </Card>
              )}

              <p className="text-center text-xs text-muted-foreground">
                AI-generated for general guidance — not medical advice.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
