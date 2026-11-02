import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'

type ToastTone = 'success' | 'error'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DISMISS_AFTER_MS = 5000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++
      // Keep at most three visible.
      setToasts((items) => [...items.slice(-2), { id, tone, message }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? DISMISS_AFTER_MS * 1.6 : DISMISS_AFTER_MS)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 top-20 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border bg-white p-3.5 pr-2 text-sm shadow-raised',
              toast.tone === 'error' ? 'border-danger-200' : 'border-aqua-200',
            )}
          >
            {toast.tone === 'error' ? (
              <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger-600" />
            ) : (
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-aqua-700" />
            )}
            <p className="min-w-0 flex-1 leading-relaxed text-ink">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-teal-500 transition-colors hover:bg-teal-100 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
