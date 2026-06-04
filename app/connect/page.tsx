'use client'

import { useEffect, useState } from 'react'
import { Navigation } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/components/auth-provider'
import { listMcpTokens, createMcpToken, revokeMcpToken, type McpTokenInfo } from '@/app/mcp-actions'
import { Plug, Copy, Check, Trash2, KeyRound, Loader2, ShieldAlert, Bot } from 'lucide-react'

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        } catch {
          toast({ title: 'Copy failed', description: 'Select and copy manually.', variant: 'destructive' })
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />}
      {copied ? 'Copied' : label || 'Copy'}
    </Button>
  )
}

export default function ConnectPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [tokens, setTokens] = useState<McpTokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    setOrigin(window.location.origin)
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    listMcpTokens().then((t) => { setTokens(t); setLoading(false) })
  }, [authLoading, user])

  const mcpUrl = `${origin}/api/mcp`
  const tokenForSnippet = freshToken || 'YOUR_TOKEN'
  const configSnippet = `{
  "mcpServers": {
    "memory-os": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "${mcpUrl}",
        "--header", "Authorization: Bearer ${tokenForSnippet}"
      ]
    }
  }
}`

  const handleCreate = async () => {
    setCreating(true)
    const res = await createMcpToken(label)
    setCreating(false)
    if (res.success && res.token) {
      setFreshToken(res.token)
      setLabel('')
      listMcpTokens().then(setTokens)
      toast({ title: 'Token created', description: 'Copy it now — it won’t be shown again.' })
    } else {
      toast({ title: 'Error', description: res.error || 'Failed.', variant: 'destructive' })
    }
  }

  const handleRevoke = async (id: string) => {
    setTokens((p) => p.filter((t) => t.id !== id))
    await revokeMcpToken(id)
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Navigation />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <header className="flex items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25">
              <Plug className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Connect to Claude</h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Expose your Memory OS data to Claude over MCP for deeper analysis. Generate a token, add it to Claude, done.
              </p>
            </div>
          </header>

          {authLoading || loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : !user ? (
            <Card className="p-10 text-center text-muted-foreground">Please sign in.</Card>
          ) : (
            <>
              {/* Generate */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Access tokens</h2>
                </div>
                <div className="flex gap-2">
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. My laptop Claude)" disabled={creating} />
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
                  </Button>
                </div>

                {freshToken && (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-2">
                    <p className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" /> Copy this now — it won’t be shown again.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white rounded px-2 py-1.5 break-all border">{freshToken}</code>
                      <CopyButton value={freshToken} />
                    </div>
                  </div>
                )}

                {tokens.length > 0 && (
                  <ul className="divide-y divide-border">
                    {tokens.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                        <div>
                          <p className="font-medium">{t.label || 'Token'}</p>
                          <p className="text-xs text-muted-foreground">
                            created {new Date(t.created_at).toLocaleDateString('en-IN')}
                            {t.last_used_at ? ` · last used ${new Date(t.last_used_at).toLocaleDateString('en-IN')}` : ' · never used'}
                          </p>
                        </div>
                        <button onClick={() => handleRevoke(t.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Revoke">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Setup instructions */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Add to Claude Desktop</h2>
                </div>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Generate a token above and copy it.</li>
                  <li>Open Claude Desktop → Settings → Developer → Edit Config.</li>
                  <li>Paste the snippet below (your token is already filled in if you just generated one), save, and restart Claude.</li>
                  <li>Ask Claude things like “analyze my sleep vs mood over the last month” or “what health issues am I tracking?”.</li>
                </ol>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">claude_desktop_config.json</span>
                    <CopyButton value={configSnippet} label="Copy config" />
                  </div>
                  <pre className="text-xs bg-secondary rounded-lg p-3 overflow-x-auto"><code>{configSnippet}</code></pre>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">MCP server URL</span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-secondary rounded px-2 py-1.5 break-all">{mcpUrl}</code>
                    <CopyButton value={mcpUrl} />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  Anyone with a token can read and write your data — treat it like a password, and revoke it here if it leaks.
                </p>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
