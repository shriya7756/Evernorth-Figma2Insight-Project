import { useCallback, useEffect, useState } from 'react'

export const ROUTES = ['workspace', 'preview', 'history', 'guide'] as const
export type Route = (typeof ROUTES)[number]

export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'workspace'
}

export function routeHref(route: Route) {
  return `#/${route}`
}

/** Minimal hash router: shareable URLs and working back/forward without a routing dependency. */
export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    window.location.hash = routeHref(next)
  }, [])

  return [route, navigate]
}
