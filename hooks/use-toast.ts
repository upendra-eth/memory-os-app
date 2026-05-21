'use client'

// Compatibility shim — delegates the legacy shadcn `useToast()` API to sonner.
// Sonner's <Toaster /> is mounted in app/layout.tsx; the legacy Radix toaster
// was never mounted, so calls to the original useToast went into a void.
// All existing call sites use `toast({ title, description, variant })`.

import type * as React from 'react'
import { toast as sonnerToast } from 'sonner'

type LegacyToastOptions = {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: 'default' | 'destructive'
}

function toast(options: LegacyToastOptions | string) {
  if (typeof options === 'string') {
    return sonnerToast(options)
  }
  const { title, description, variant } = options
  const message = (title as string) ?? ''
  const opts = description ? { description: description as string } : undefined
  if (variant === 'destructive') {
    return sonnerToast.error(message, opts)
  }
  return sonnerToast.success(message, opts)
}

export function useToast() {
  return { toast }
}

export { toast }
