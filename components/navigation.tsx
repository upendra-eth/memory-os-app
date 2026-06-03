'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { Brain, Plus, MessageSquare, Clock, User, CheckSquare, Stethoscope, LogOut, Dumbbell, TrendingUp, Sparkles } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Brain },
  { href: '/add', label: 'Add Entry', icon: Plus },
  { href: '/training', label: 'Training', icon: Dumbbell },
  { href: '/exercises', label: 'Progress', icon: TrendingUp },
  { href: '/insights', label: 'Insights', icon: Sparkles },
  { href: '/timeline', label: 'Timeline', icon: Clock },
  { href: '/ask', label: 'Ask', icon: MessageSquare },
  { href: '/audit', label: 'Audit', icon: CheckSquare },
  { href: '/lab-reports', label: 'Labs', icon: Stethoscope },
  { href: '/profile', label: 'Profile', icon: User },
]

export function Navigation() {
  const pathname = usePathname()
  const { user, signOut, isLoading } = useAuth()

  const displayName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:static md:border-t-0 md:border-r md:h-screen md:w-64 md:flex-shrink-0">
      <div className="flex items-center justify-around gap-1 overflow-x-auto py-2 md:flex-col md:items-stretch md:justify-start md:gap-2 md:overflow-x-visible md:p-4 md:h-full">
        {/* Desktop Logo */}
        <div className="hidden md:flex items-center gap-3 px-4 py-4 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Memory OS</h1>
            <p className="text-xs text-muted-foreground">Personal Intelligence</p>
          </div>
        </div>
        
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-shrink-0 flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors md:flex-row md:gap-3 md:px-4 md:py-3',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs md:text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}

        {/* User section — desktop only */}
        <div className="hidden md:flex md:flex-col md:mt-auto md:pt-4 md:border-t md:border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 px-4 py-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
