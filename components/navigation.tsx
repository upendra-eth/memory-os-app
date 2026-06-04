'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { Brain, Plus, MessageSquare, Clock, User, Stethoscope, LogOut, Dumbbell, TrendingUp, Sparkles, MoreHorizontal, HeartPulse, Compass, Target, Plug } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogoTile } from '@/components/logo'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Brain },
  { href: '/add', label: 'Add Entry', icon: Plus },
  { href: '/plan', label: 'Plan', icon: Target },
  { href: '/training', label: 'Training', icon: Dumbbell },
  { href: '/exercises', label: 'Progress', icon: TrendingUp },
  { href: '/insights', label: 'Insights', icon: Sparkles },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/timeline', label: 'Timeline', icon: Clock },
  { href: '/ask', label: 'Ask', icon: MessageSquare },
  { href: '/lab-reports', label: 'Reports', icon: Stethoscope },
  { href: '/issues', label: 'Issues', icon: HeartPulse },
  { href: '/connect', label: 'Connect', icon: Plug },
  { href: '/profile', label: 'Profile', icon: User },
]

// On mobile the bottom bar only has room for a few items; show the most-used
// ones inline and tuck the rest behind a "More" sheet (which also holds the
// account / sign-out controls that the desktop sidebar shows at the bottom).
const MOBILE_PRIMARY = ['/dashboard', '/add', '/ask', '/timeline']

export function Navigation() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'User'
  const initials = displayName.slice(0, 2).toUpperCase()

  const primaryItems = navItems.filter((i) => MOBILE_PRIMARY.includes(i.href))
  const moreItems = navItems.filter((i) => !MOBILE_PRIMARY.includes(i.href))
  const moreActive = moreItems.some((i) => i.href === pathname)

  const itemClasses = (isActive: boolean) =>
    cn(
      'flex flex-shrink-0 flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors md:flex-row md:gap-3 md:px-4 md:py-3',
      isActive
        ? 'text-primary bg-primary/10'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
    )

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:static md:border-t-0 md:border-r md:h-screen md:w-64 md:flex-shrink-0">
      <div className="flex items-stretch justify-around gap-1 py-2 md:flex-col md:justify-start md:gap-2 md:p-4 md:h-full">
        {/* Desktop Logo */}
        <div className="hidden md:flex items-center gap-3 px-4 py-4 mb-4">
          <LogoTile float />
          <div>
            <h1 className="text-lg font-semibold text-gradient-brand">Memory OS</h1>
            <p className="text-xs text-muted-foreground">Personal Intelligence</p>
          </div>
        </div>

        {/* ---- DESKTOP: full list ---- */}
        <div className="hidden md:flex md:flex-col md:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={itemClasses(isActive)}>
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* ---- MOBILE: primary items + More ---- */}
        {primaryItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link key={item.href} href={item.href} className={cn('md:hidden', itemClasses(isActive))}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button type="button" className={cn('md:hidden', itemClasses(moreActive))}>
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate font-normal">{user?.email}</p>
                </div>
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 p-4">
              {moreItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border p-4 transition-colors',
                        isActive
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </Link>
                  </SheetClose>
                )
              })}
            </div>
            <div className="px-4 pb-6">
              <button
                onClick={() => {
                  setMoreOpen(false)
                  signOut()
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 px-4 py-3 text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>

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
