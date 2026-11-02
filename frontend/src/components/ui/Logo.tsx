import { cn } from '../../lib/cn'

/** Original Figma2Insight mark: layout tiles resolving into an insight trend line. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" fill="#3EFFC0" fillOpacity="0.12" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" stroke="#3EFFC0" strokeOpacity="0.35" />
      <rect x="7" y="7" width="8" height="8" rx="2" fill="#FFFFFF" />
      <rect x="17" y="7" width="8" height="8" rx="2" fill="#FFFFFF" fillOpacity="0.35" />
      <rect x="7" y="17" width="8" height="8" rx="2" fill="#FFFFFF" fillOpacity="0.35" />
      <path d="M17.5 24.5 L21 20.5 L23 22.5 L25 18" stroke="#3EFFC0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading text-lg font-extrabold tracking-tight text-white', className)}>
      Figma<span className="text-aqua-400">2</span>Insight
    </span>
  )
}
