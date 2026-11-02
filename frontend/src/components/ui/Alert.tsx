import React from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

export type AlertTone = 'info' | 'success' | 'warning' | 'error'

const tones: Record<AlertTone, { box: string; icon: React.ElementType; iconClass: string }> = {
  info: { box: 'bg-teal-50 border-teal-200 text-teal-800', icon: Info, iconClass: 'text-teal-600' },
  success: { box: 'bg-aqua-50 border-aqua-200 text-aqua-800', icon: CheckCircle2, iconClass: 'text-aqua-700' },
  warning: { box: 'bg-caution-50 border-caution-200 text-caution-700', icon: AlertTriangle, iconClass: 'text-caution-700' },
  error: { box: 'bg-danger-50 border-danger-200 text-danger-700', icon: XCircle, iconClass: 'text-danger-600' },
}

interface AlertProps {
  tone?: AlertTone
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const { box, icon: Icon, iconClass } = tones[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-start', box, className)}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', iconClass)} />
        <div className="min-w-0 leading-relaxed">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 sm:ml-auto">{action}</div>}
    </div>
  )
}
