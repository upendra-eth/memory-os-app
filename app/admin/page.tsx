'use client'

import { useEffect, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import { amIAdmin, lookupUser, setUserLimit, resetUserUsageToday, type UserLimitInfo } from '@/app/admin-actions'
import { ShieldCheck, Search, Loader2, RotateCcw } from 'lucide-react'

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [info, setInfo] = useState<UserLimitInfo | null>(null)
  const [limitInput, setLimitInput] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (authLoading) return
    if (!user) { setIsAdmin(false); return }
    amIAdmin().then(setIsAdmin)
  }, [authLoading, user])

  const search = async () => {
    if (!email.trim()) return
    setBusy(true)
    const res = await lookupUser(email)
    setBusy(false)
    if (res.success && res.info) {
      setInfo(res.info)
      setLimitInput(res.info.daily_limit != null ? String(res.info.daily_limit) : '')
    } else {
      setInfo(null)
      toast({ title: 'Not found', description: res.error || 'No user.', variant: 'destructive' })
    }
  }

  const save = async (limit: number | null) => {
    if (!info) return
    setBusy(true)
    const res = await setUserLimit(info.email, limit)
    setBusy(false)
    if (res.success) { toast({ title: 'Saved', description: 'Limit updated.' }); search() }
    else toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
  }

  const reset = async () => {
    if (!info) return
    setBusy(true)
    const res = await resetUserUsageToday(info.email)
    setBusy(false)
    if (res.success) { toast({ title: 'Reset', description: "Today's usage cleared." }); search() }
    else toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="flex items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">Manage per-user daily AI limits.</p>
            </div>
          </header>

          {isAdmin === null || authLoading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !isAdmin ? (
            <Card className="p-10 text-center text-muted-foreground">You don&apos;t have access to this page.</Card>
          ) : (
            <>
              <Card className="p-4 flex gap-2">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="User email"
                  onKeyDown={(e) => e.key === 'Enter' && search()} disabled={busy} />
                <Button onClick={search} disabled={busy || !email.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </Card>

              {info && (
                <Card className="p-5 space-y-4">
                  <div>
                    <p className="font-semibold">{info.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Used today: <span className="font-medium text-foreground">{info.used_today}</span> /{' '}
                      {info.effective_limit} ({info.daily_limit != null ? 'custom' : `default ${info.default_limit}`})
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Daily AI limit</label>
                    <div className="flex gap-2">
                      <Input type="number" min={0} value={limitInput} onChange={(e) => setLimitInput(e.target.value)}
                        placeholder={`default ${info.default_limit}`} disabled={busy} className="w-40" />
                      <Button onClick={() => save(limitInput.trim() === '' ? null : Number(limitInput))} disabled={busy}>Save</Button>
                      <Button variant="outline" onClick={() => save(null)} disabled={busy}>Use default</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Set a high number to effectively unlimit, or clear to use the default ({info.default_limit}/day). Admins are always unlimited.</p>
                  </div>

                  <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
                    <RotateCcw className="h-4 w-4 mr-1.5" /> Reset today&apos;s usage
                  </Button>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
