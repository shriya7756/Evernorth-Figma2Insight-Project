import React, { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'lg'
}

/**
 * Accessible dialog built on the native <dialog> element, which provides
 * focus containment, Escape-to-close and an inert background for free.
 */
export function Modal({ isOpen, onClose, title, description, children, footer, size = 'lg' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (isOpen && !dialog.open) {
      dialog.showModal()
      document.body.style.overflow = 'hidden'
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'm-auto max-h-[min(90vh,900px)] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-teal-200 bg-white p-0 text-ink shadow-raised',
        'backdrop:bg-ink/60 backdrop:backdrop-blur-[2px] open:animate-dialog-in',
        size === 'lg' ? 'max-w-4xl' : 'max-w-md',
      )}
    >
      {isOpen && (
        <div className="flex max-h-[min(90vh,900px)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-teal-100 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-bold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-teal-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-teal-600 transition-colors hover:bg-teal-100 hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </header>
          {children && <div className="min-h-0 flex-1 overflow-auto">{children}</div>}
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-teal-100 bg-teal-50/60 px-5 py-3 sm:px-6">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}
