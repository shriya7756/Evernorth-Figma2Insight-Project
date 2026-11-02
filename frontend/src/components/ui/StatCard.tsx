import React from 'react'
import { cn } from '../../lib/cn'

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: React.ElementType
  tone?: 'default' | 'warning'
  className?: string
  style?: React.CSSProperties
}

export function StatCard({ label, value, icon: Icon, tone = 'default', className, style }: StatCardProps) {
  return (
    <div
      style={style}
      className={cn(
        'rounded-xl border p-4 transition-colors',
        tone === 'warning' ? 'border-caution-200 bg-caution-50' : 'border-teal-100 bg-teal-50',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-xs font-semibold uppercase tracking-wider', tone === 'warning' ? 'text-caution-700' : 'text-teal-600')}>
          {label}
        </p>
        {Icon && <Icon aria-hidden className={cn('size-4', tone === 'warning' ? 'text-caution-700' : 'text-teal-500')} />}
      </div>
      <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  )
}
