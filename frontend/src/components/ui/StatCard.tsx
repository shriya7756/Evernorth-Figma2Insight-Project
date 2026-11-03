import React from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: React.ElementType
  tone?: 'default' | 'warning'
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function StatCard({ label, value, icon: Icon, tone = 'default', className, style, onClick }: StatCardProps) {
  const isClickable = typeof onClick === 'function'

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-xs font-semibold uppercase tracking-wider', tone === 'warning' ? 'text-caution-700' : 'text-teal-600')}>
          {label}
        </p>
        <div className="flex items-center gap-1">
          {Icon && <Icon aria-hidden className={cn('size-4', tone === 'warning' ? 'text-caution-700' : 'text-teal-500')} />}
          {isClickable && <ChevronRight className="size-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-charcoal-500" />}
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="font-heading text-3xl font-bold tabular-nums text-ink">{value}</p>
        {isClickable && (
          <span className="text-[11px] font-medium text-teal-700 opacity-80 group-hover:opacity-100 underline underline-offset-2">
            Inspect
          </span>
        )}
      </div>
    </>
  )

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={cn(
          'group text-left w-full rounded-xl border p-4 transition-all cursor-pointer shadow-xs',
          'hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-teal-500',
          tone === 'warning'
            ? 'border-caution-200 bg-caution-50 hover:bg-caution-100/80 hover:border-caution-300'
            : 'border-teal-100 bg-teal-50 hover:bg-teal-100/70 hover:border-teal-200',
          className,
        )}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      style={style}
      className={cn(
        'rounded-xl border p-4 transition-colors',
        tone === 'warning' ? 'border-caution-200 bg-caution-50' : 'border-teal-100 bg-teal-50',
        className,
      )}
    >
      {content}
    </div>
  )
}
