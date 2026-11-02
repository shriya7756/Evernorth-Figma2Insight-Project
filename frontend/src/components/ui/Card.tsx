import React from 'react'
import { cn } from '../../lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article' | 'aside'
}

export function Card({ as: Tag = 'section', className, ...props }: CardProps) {
  return (
    <Tag
      className={cn('rounded-2xl border border-teal-200/80 bg-white shadow-card', className)}
      {...props}
    />
  )
}

interface CardHeaderProps {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  id?: string
  className?: string
}

export function CardHeader({ title, description, eyebrow, actions, id, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-600">{eyebrow}</p>
        )}
        <h2 id={id} className="text-lg font-bold leading-snug text-ink">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-teal-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
