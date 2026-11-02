import React from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone = 'neutral' | 'success' | 'accent' | 'warning' | 'danger' | 'dark'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-teal-100 text-teal-700 ring-teal-200',
  success: 'bg-aqua-50 text-aqua-800 ring-aqua-200',
  accent: 'bg-aqua-400 text-ink ring-aqua-500',
  warning: 'bg-caution-50 text-caution-700 ring-caution-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  dark: 'bg-white/10 text-white ring-white/15',
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
}

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
