import { cn } from '@/lib/utils'

/**
 * Memory OS mark — a "synapse / constellation": a central memory node with
 * three linked satellites. Uses currentColor so it renders white inside the
 * brand gradient tile, or tinted anywhere else.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('h-6 w-6', className)}
      aria-hidden="true"
    >
      <path
        d="M12 12V4.5M12 12 5.5 16.5M12 12 18.5 16.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="12" cy="4" r="2" fill="currentColor" />
      <circle cx="5" cy="17" r="2" fill="currentColor" />
      <circle cx="19" cy="17" r="2" fill="currentColor" />
    </svg>
  )
}

/**
 * Full brand lockup: the gradient tile + mark. `size` controls the tile.
 * Used in nav and auth headers.
 */
export function LogoTile({
  className,
  size = 'md',
  float = false,
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  float?: boolean
}) {
  const dims = size === 'lg' ? 'h-16 w-16 rounded-2xl' : size === 'sm' ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl'
  const glyph = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25',
        dims,
        float && 'animate-float',
        className,
      )}
    >
      <Logo className={glyph} />
    </div>
  )
}
