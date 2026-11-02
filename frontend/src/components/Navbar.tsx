import React, { useEffect, useRef, useState } from 'react'
import { BookOpen, Clock, LayoutDashboard, Menu, MonitorPlay, X } from 'lucide-react'
import { BackendStatus } from '../types'
import { Route, routeHref } from '../hooks/useHashRoute'
import { cn } from '../lib/cn'
import { LogoMark, Wordmark } from './ui/Logo'

interface NavbarProps {
  route: Route
  status: BackendStatus | null
  isConnecting: boolean
}

const NAV_ITEMS: { route: Route; label: string; icon: React.ElementType }[] = [
  { route: 'workspace', label: 'Workspace', icon: LayoutDashboard },
  { route: 'preview', label: 'Preview', icon: MonitorPlay },
  { route: 'history', label: 'Saved analyses', icon: Clock },
  { route: 'guide', label: 'Guide', icon: BookOpen },
]

function ConnectionStatus({ status, isConnecting }: { status: BackendStatus | null; isConnecting: boolean }) {
  const isConnected = status?.status === 'connected'
  const label = isConnected ? 'API connected' : isConnecting ? 'Connecting…' : 'API offline'
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-teal-200" role="status">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          isConnected && 'bg-aqua-400 shadow-[0_0_0_3px_rgb(62_255_192/0.2)]',
          !isConnected && isConnecting && 'animate-pulse bg-teal-300',
          !isConnected && !isConnecting && 'bg-danger-200',
        )}
      />
      {label}
    </span>
  )
}

export const Navbar: React.FC<NavbarProps> = ({ route, status, isConnecting }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [route])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        toggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/95 text-white backdrop-blur supports-[backdrop-filter]:bg-ink/85">
      <a
        href="#main"
        onClick={(e) => {
          // The URL hash is used for routing, so move focus without changing it.
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-aqua-400 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href={routeHref('workspace')} className="group flex items-center gap-2.5 rounded-lg" aria-label="Figma2Insight home">
          <LogoMark className="transition-transform duration-300 group-hover:scale-105" />
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map(({ route: r, label }) => {
              const active = r === route
              return (
                <li key={r}>
                  <a
                    href={routeHref(r)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex h-10 items-center rounded-lg px-3.5 text-sm font-medium transition-colors duration-200',
                      active ? 'text-white' : 'text-teal-200 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {label}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-aqua-400 transition-transform duration-300 ease-out-soft',
                        active ? 'scale-x-100' : 'scale-x-0',
                      )}
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ConnectionStatus status={status} isConnecting={isConnecting} />
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="grid size-11 place-items-center rounded-xl text-white transition-colors hover:bg-white/10 md:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {menuOpen && (
        <nav id="mobile-menu" aria-label="Primary" className="animate-menu-in border-t border-white/10 bg-ink md:hidden">
          <ul className="space-y-1 px-4 py-3">
            {NAV_ITEMS.map(({ route: r, label, icon: Icon }) => {
              const active = r === route
              return (
                <li key={r}>
                  <a
                    href={routeHref(r)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors',
                      active ? 'bg-aqua-400/10 text-aqua-300' : 'text-teal-100 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                    {label}
                  </a>
                </li>
              )
            })}
          </ul>
          <div className="border-t border-white/10 px-7 py-3">
            <ConnectionStatus status={status} isConnecting={isConnecting} />
          </div>
        </nav>
      )}
    </header>
  )
}
