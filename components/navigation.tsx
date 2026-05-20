'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Brain, Plus, MessageSquare, Database, BookOpen, Clock, User, CheckSquare, Stethoscope } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Brain },
  { href: '/add', label: 'Add Entry', icon: Plus },
  { href: '/timeline', label: 'Timeline', icon: Clock },
  { href: '/ask', label: 'Ask', icon: MessageSquare },
  { href: '/audit', label: 'Audit', icon: CheckSquare },
  { href: '/lab-reports', label: 'Labs', icon: Stethoscope },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/explorer', label: 'Explore', icon: Database },
  { href: '/ingestor', label: 'Ingestor', icon: BookOpen },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:static md:border-t-0 md:border-r md:h-screen md:w-64 md:flex-shrink-0">
      <div className="flex items-center justify-around py-2 md:flex-col md:items-stretch md:justify-start md:p-4 md:gap-2">
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
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors md:flex-row md:gap-3 md:px-4 md:py-3',
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
      </div>
    </nav>
  )
}
