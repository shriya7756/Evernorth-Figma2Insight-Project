import { routeHref } from '../hooks/useHashRoute'
import { LogoMark, Wordmark } from './ui/Logo'

export function Footer() {
  return (
    <footer className="bg-ink text-teal-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <LogoMark className="size-7" />
          <div>
            <Wordmark className="text-base" />
            <p className="text-xs text-teal-300">Figma designs, turned into structured dashboard insight.</p>
          </div>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li><a className="rounded transition-colors hover:text-aqua-300" href={routeHref('workspace')}>Workspace</a></li>
            <li><a className="rounded transition-colors hover:text-aqua-300" href={routeHref('history')}>Saved analyses</a></li>
            <li><a className="rounded transition-colors hover:text-aqua-300" href={routeHref('guide')}>Guide</a></li>
          </ul>
        </nav>
        <p className="text-xs text-teal-400">© {new Date().getFullYear()} Figma2Insight</p>
      </div>
    </footer>
  )
}
