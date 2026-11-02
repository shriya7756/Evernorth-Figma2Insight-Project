import React from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'onDark'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none ' +
  'transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-aqua-400 text-ink shadow-sm hover:bg-aqua-300 hover:shadow-glow',
  secondary: 'bg-white text-ink border border-teal-200 shadow-sm hover:border-teal-300 hover:bg-teal-50',
  dark: 'bg-ink text-white shadow-sm hover:bg-teal-800',
  ghost: 'text-teal-700 hover:bg-teal-100 hover:text-ink',
  danger: 'bg-danger-600 text-white shadow-sm hover:bg-danger-700',
  onDark: 'bg-white/10 text-white border border-white/15 hover:bg-white/15 hover:border-white/25',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  )
})
