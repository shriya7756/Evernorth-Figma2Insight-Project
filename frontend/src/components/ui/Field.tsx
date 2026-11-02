import React, { useId } from 'react'
import { cn } from '../../lib/cn'

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: React.ReactNode
  error?: string
  optional?: boolean
}

export function TextField({ label, hint, error, optional, className, ...props }: TextFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
        {label}
        {optional && <span className="text-xs font-medium text-teal-500">Optional</span>}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        className={cn(
          'h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-ink placeholder:text-teal-400',
          'transition-[border-color,box-shadow] duration-200',
          'hover:border-teal-300 focus-visible:border-teal-700',
          'disabled:cursor-not-allowed disabled:bg-teal-50 disabled:text-teal-500',
          error ? 'border-danger-600 bg-danger-50/40' : 'border-teal-200',
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs text-teal-600">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
