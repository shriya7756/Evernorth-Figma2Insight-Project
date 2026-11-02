import React from 'react'
import { cn } from '../../lib/cn'

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center animate-fade-up', className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-teal-100 text-teal-600 ring-8 ring-teal-50">
        <Icon aria-hidden className="size-6" />
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-teal-600">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
