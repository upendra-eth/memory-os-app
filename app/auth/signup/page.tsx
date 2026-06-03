'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Brain, Mail, Lock, User, Github, Loader2, AlertCircle, Sparkles, Shield, Zap, BarChart3, MailCheck } from 'lucide-react'
import { signUpWithPassword } from '@/app/auth/auth-actions'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  // If the user is already authenticated (e.g. session restored client-side
  // after OAuth), navigate to the dashboard without waiting for a refresh.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setIsLoading(false)
      return
    }

    const result = await signUpWithPassword(formData)
    if (result?.error) {
      setError(result.error)
      setIsLoading(false)
      return
    }
    if (result?.needsVerification) {
      setPendingEmail(result.email)
      setIsLoading(false)
    }
    // Otherwise: server action redirected; nothing more to do.
  }

  const handleSocialLogin = async (provider: 'google' | 'github') => {
    setSocialLoading(provider)
    setError(null)

    // Initiate OAuth from the browser client so the PKCE code verifier is
    // persisted reliably and the /auth/callback exchange can succeed.
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setSocialLoading(null)
    }
    // On success the browser is redirected to the provider; nothing more to do.
  }

  const features = [
    { icon: Shield, text: 'Your data stays private' },
    { icon: Zap, text: 'AI-powered life insights' },
    { icon: BarChart3, text: '20-dimension tracking' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5 flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-accent/10 rounded-full blur-[128px] animate-pulse delay-1000" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent text-white mb-4 shadow-lg shadow-primary/25">
            <Brain className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Join Memory OS</h1>
          <p className="text-muted-foreground mt-1">Start building your personal intelligence</p>
        </div>

        {pendingEmail ? (
          <Card className="p-8 backdrop-blur-sm bg-card/95 border-border/50 shadow-2xl shadow-primary/5">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600">
                <MailCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Check your email</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  We sent a confirmation link to <span className="font-medium text-foreground">{pendingEmail}</span>.
                  Click the link in the email to verify your account and continue to onboarding.
                </p>
              </div>
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Didn&apos;t get the email? Check your spam folder, or{' '}
                  <button
                    onClick={() => setPendingEmail(null)}
                    className="text-primary hover:underline font-medium"
                  >
                    try a different email
                  </button>
                  .
                </AlertDescription>
              </Alert>
              <p className="text-xs text-muted-foreground pt-2">
                Already verified?{' '}
                <Link href="/auth/login" className="text-primary hover:underline font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </Card>
        ) : (
        <Card className="p-8 backdrop-blur-sm bg-card/95 border-border/50 shadow-2xl shadow-primary/5">
          <div className="space-y-6">
            {/* Features */}
            <div className="flex justify-center gap-6">
              {features.map((f) => (
                <div key={f.text} className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[80px]">{f.text}</span>
                </div>
              ))}
            </div>

            {error && (
              <Alert variant="destructive" className="animate-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Social Login */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => handleSocialLogin('google')}
                disabled={socialLoading !== null || isLoading}
                className="hover:border-primary/50 transition-all"
              >
                {socialLoading === 'google' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Google
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => handleSocialLogin('github')}
                disabled={socialLoading !== null || isLoading}
                className="hover:border-primary/50 transition-all"
              >
                {socialLoading === 'github' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Github className="h-4 w-4 mr-2" />
                )}
                GitHub
              </Button>
            </div>

            <div className="relative">
              <Separator />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                or sign up with email
              </span>
            </div>

            {/* Sign Up Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">Display Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    name="displayName"
                    placeholder="Your name"
                    required
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isLoading || socialLoading !== null}
                className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </Card>
        )}

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <Sparkles className="h-3 w-3" />
            <span>Free forever · No credit card required</span>
          </div>
        </div>
      </div>
    </div>
  )
}
