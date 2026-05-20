'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signOut: () => Promise<void>
  profileId: string | null
  userEmail: string | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
  profileId: null,
  userEmail: null,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileId, setProfileId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const fetchProfile = useCallback(async (authUserId: string) => {
    const { data: profile } = await supabase
      .from('user_profile')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single()

    setProfileId(profile?.id ?? null)
  }, [supabase])

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      setSession(currentSession)
      setUser(currentSession?.user ?? null)

      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id)
      }
      setIsLoading(false)
    }

    getSession()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          await fetchProfile(newSession.user.id)
        } else {
          setProfileId(null)
        }

        setIsLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfileId(null)
    router.push('/auth/login')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signOut,
        profileId,
        userEmail: user?.email ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
