import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MousePointerClick, X } from 'lucide-react'
import { VistaTile, VistaWidget } from '../types'
import { cn } from '../lib/cn'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'

interface AbsoluteLayoutViewerProps {
  tiles: VistaTile[]
  widgets: VistaWidget[]
  dashboardSize: { width: number; height: number }
}

const TYPE_STYLES: Record<string, { tile: string; chip: string; label: string }> = {
  KPI_CARD: { tile: 'border-aqua-500/60 bg-aqua-50', chip: 'bg-aqua-400 text-ink', label: 'KPI card' },
  CHART: { tile: 'border-teal-500/50 bg-teal-50', chip: 'bg-teal-700 text-white', label: 'Chart' },
  TABLE: { tile: 'border-teal-700/50 bg-white', chip: 'bg-ink text-white', label: 'Table' },
  OTHER: { tile: 'border-teal-200 bg-white', chip: 'bg-teal-100 text-teal-700', label: 'Other' },
}

const styleFor = (type: string) => TYPE_STYLES[type] ?? TYPE_STYLES.OTHER

const isNegativeTrend = (trend: string) => /^[−-]|↓|↘/.test(trend.trim())

function WidgetInspector({ widget, onClose }: { widget: VistaWidget; onClose: () => void }) {
  const rows: [string, React.ReactNode][] = [
    ['Component type', styleFor(widget.componentType).label],
    ['Semantic label', widget.semanticLabel || '—'],
    ['Source ID', <code key="s" className="break-all font-mono text-xs">{widget.sourceComponentId || '—'}</code>],
  ]
  if (widget.kpiLabel) rows.push(['KPI label', widget.kpiLabel])
  if (widget.kpiValue) rows.push(['KPI value', <strong key="v">{widget.kpiValue}</strong>])
  if (widget.trend) rows.push(['Trend', widget.trend])
  if (widget.supportingText) rows.push(['Supporting text', widget.supportingText])
  if (widget.position) {
    const p = widget.position
    rows.push([
      'Figma geometry',
      <code key="g" className="font-mono text-xs">
        x {p.x.toFixed(0)} · y {p.y.toFixed(0)} · {p.width.toFixed(0)}×{p.height.toFixed(0)}
      </code>,
    ])
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Component inspector</p>
          <h3 className="mt-1 break-words text-base font-bold">{widget.title || 'Untitled widget'}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="-mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-teal-600 transition-colors hover:bg-teal-100 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      {widget.needsReview && (
        <Badge tone="warning" dot className="mt-3">
          Needs review
        </Badge>
      )}
      <dl className="mt-4 divide-y divide-teal-100 text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-3 py-2.5">
            <dt className="text-teal-600">{term}</dt>
            <dd className="min-w-0 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {widget.chartData && widget.chartData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Chart data</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm scrollbar-thin">
            {widget.chartData.map((d, i) => (
              <li key={i} className="flex justify-between gap-3 rounded-lg bg-teal-50 px-3 py-1.5">
                <span className="truncate">{d.label}</span>
                <span className="font-semibold tabular-nums">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {widget.text && widget.text.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Extracted text</p>
          <p className="mt-2 max-h-32 overflow-auto rounded-lg bg-teal-50 p-3 text-sm leading-relaxed text-teal-800 scrollbar-thin">
            {widget.text.slice(0, 20).join(' · ')}
            {widget.text.length > 20 && ' …'}
          </p>
        </div>
      )}
    </div>
  )
}

export const AbsoluteLayoutViewer: React.FC<AbsoluteLayoutViewerProps> = ({ tiles, widgets, dashboardSize }) => {
  const widgetMap = useMemo(() => {
    const map = new Map<string, VistaWidget>()
    widgets.forEach((w) => {
      map.set(w.id, w)
      if (w.widgetId) map.set(w.widgetId, w)
    })
    return map
  }, [widgets])

  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [selected, setSelected] = useState<VistaWidget | null>(null)

  // Non-overlapping 12-column grid layout resolver
  // Ensures every single tile occupies its own dedicated space with zero overlapping.
  const resolvedTiles = useMemo(() => {
    const COLS = 12
    const TYPE_PRIORITY: Record<string, number> = {
      KPI_CARD: 1,
      CHART: 2,
      TABLE: 3,
      OTHER: 4,
    }

    const items = tiles
      .map((tile, idx) => {
        const widgetId = tile.widgetId || tile.widgetIds?.[0]
        const widget = widgetId ? widgetMap.get(widgetId) : undefined
        const type = widget?.componentType || 'OTHER'
        const grid = tile.grid ?? widget?.grid
        const pos = widget?.position

        let colSpan = Math.min(
          12,
          Math.max(1, grid?.colSpan ?? (pos?.width ? Math.round((pos.width / dashboardSize.width) * 12) : type === 'KPI_CARD' ? 3 : 6)),
        )
        let rowSpan = Math.min(
          12,
          Math.max(1, grid?.rowSpan ?? (pos?.height ? Math.max(1, Math.round((pos.height / dashboardSize.height) * 12)) : 2)),
        )

        // Compact constraints: prevent huge empty blocks and excessive scrolling
        if (type === 'OTHER') {
          // Headers, subtitles, annotations take at most 1 compact row
          rowSpan = 1
        } else if (type === 'KPI_CARD') {
          rowSpan = 2
          colSpan = Math.min(Math.max(colSpan, 2), 3)
        } else if (type === 'CHART' || type === 'TABLE') {
          // Charts and tables capped at 3 rows so they don't stretch the page
          rowSpan = Math.min(Math.max(rowSpan, 2), 3)
          colSpan = Math.min(Math.max(colSpan, 4), 6)
        }

        const desiredCol = Math.min(
          12 - colSpan,
          Math.max(0, grid?.colOffset ?? (pos?.x ? Math.floor((pos.x / dashboardSize.width) * 12) : 0)),
        )
        const desiredRow = Math.max(0, grid?.rowOffset ?? (pos?.y ? Math.floor((pos.y / dashboardSize.height) * 12) : 0))

        return {
          tile,
          widget,
          type,
          idx,
          colSpan,
          rowSpan,
          desiredCol,
          desiredRow,
          priority: TYPE_PRIORITY[type] ?? 99,
        }
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        if (a.desiredRow !== b.desiredRow) return a.desiredRow - b.desiredRow
        return a.desiredCol - b.desiredCol
      })

    const occupied: boolean[][] = []
    const isOccupied = (r: number, c: number) => Boolean(occupied[r]?.[c])
    const markOccupied = (r: number, c: number) => {
      if (!occupied[r]) occupied[r] = []
      occupied[r][c] = true
    }

    const fits = (startR: number, startC: number, spanR: number, spanC: number) => {
      if (startC + spanC > COLS) return false
      for (let r = startR; r < startR + spanR; r++) {
        for (let c = startC; c < startC + spanC; c++) {
          if (isOccupied(r, c)) return false
        }
      }
      return true
    }

    const placed: Array<{
      tile: VistaTile
      widget?: VistaWidget
      type: string
      colOffset: number
      rowOffset: number
      colSpan: number
      rowSpan: number
      idx: number
    }> = []

    for (const item of items) {
      let placedR = item.desiredRow
      let placedC = item.desiredCol
      let found = false

      for (let r = item.desiredRow; r < item.desiredRow + 50; r++) {
        const cStart = r === item.desiredRow ? item.desiredCol : 0
        for (let c = cStart; c <= COLS - item.colSpan; c++) {
          if (fits(r, c, item.rowSpan, item.colSpan)) {
            placedR = r
            placedC = c
            found = true
            break
          }
        }
        if (found) break
      }

      if (!found) {
        let r = 0
        while (!found) {
          for (let c = 0; c <= COLS - item.colSpan; c++) {
            if (fits(r, c, item.rowSpan, item.colSpan)) {
              placedR = r
              placedC = c
              found = true
              break
            }
          }
          r++
        }
      }

      for (let r = placedR; r < placedR + item.rowSpan; r++) {
        for (let c = placedC; c < placedC + item.colSpan; c++) {
          markOccupied(r, c)
        }
      }

      placed.push({
        tile: item.tile,
        widget: item.widget,
        type: item.type,
        colOffset: placedC,
        rowOffset: placedR,
        colSpan: item.colSpan,
        rowSpan: item.rowSpan,
        idx: item.idx,
      })
    }

    return placed
  }, [tiles, widgetMap, dashboardSize])

  const GAP = 10
  const COLS = 12
  const maxRow = useMemo(() => {
    return Math.max(12, ...resolvedTiles.map((t) => t.rowOffset + t.rowSpan))
  }, [resolvedTiles])

  const canvasWidth = dashboardSize.width
  const cellW = (canvasWidth - GAP * (COLS + 1)) / COLS
  // Compact cell height to prevent wasted vertical space and excessive scrolling
  const cellH = Math.max(48, Math.min(54, (dashboardSize.height - GAP * 13) / 16))
  const canvasHeight = Math.max(Math.round(dashboardSize.height * 0.65), GAP + maxRow * (cellH + GAP))

  // Fit the canvas to its container; ResizeObserver also reacts to sidebar/layout changes.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setScale(Math.min(1, el.clientWidth / canvasWidth))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [canvasWidth])

  // Dismiss inspector drawer on Escape key
  useEffect(() => {
    if (!selected) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    widgets.forEach((w) => {
      const key = TYPE_STYLES[w.componentType] ? w.componentType : 'OTHER'
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [widgets])

  return (
    <div className="relative w-full">
      <div className="min-w-0 rounded-2xl border border-teal-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ul className="flex flex-wrap gap-2" aria-label="Component types">
            {Object.entries(TYPE_STYLES).map(([type, s]) =>
              typeCounts[type] ? (
                <li key={type} className="inline-flex items-center gap-2 text-xs font-medium text-teal-700">
                  <span aria-hidden className={cn('size-2.5 rounded-sm', s.chip)} />
                  {s.label} · {typeCounts[type]}
                </li>
              ) : null,
            )}
          </ul>
          <p className="font-mono text-xs text-teal-500">
            {Math.round(canvasWidth)}×{Math.round(canvasHeight)} px · {(scale * 100).toFixed(0)}%
          </p>
        </div>

        <div ref={containerRef} className="mt-4 w-full overflow-hidden">
          {/* Reserve the scaled size so the transformed canvas never causes horizontal overflow. */}
          <div style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
            <div
              className="relative origin-top-left rounded-xl bg-teal-50/60 ring-1 ring-teal-200"
              style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${scale})` }}
            >
              {resolvedTiles.map((item) => {
                const widget = item.widget
                const type = item.type
                const s = styleFor(type)
                const label = widget?.kpiLabel || widget?.semanticLabel || widget?.title || 'Untitled widget'
                const isSelected = !!widget && selected?.id === widget.id

                const left = GAP + item.colOffset * (cellW + GAP)
                const top = GAP + item.rowOffset * (cellH + GAP)
                const width = item.colSpan * cellW + (item.colSpan - 1) * GAP
                const height = item.rowSpan * cellH + (item.rowSpan - 1) * GAP

                return (
                  <button
                    type="button"
                    key={item.tile.tileId || item.tile.id || item.idx}
                    disabled={!widget}
                    onClick={() => setSelected(isSelected ? null : widget ?? null)}
                    aria-pressed={isSelected}
                    aria-label={`${s.label}: ${label}`}
                    className={cn(
                      'absolute flex flex-col overflow-hidden rounded-lg border p-2.5 text-left shadow-xs',
                      'transition-[box-shadow,border-color,transform] duration-200 hover:z-10 hover:-translate-y-px hover:shadow-raised cursor-pointer',
                      s.tile,
                      isSelected && 'z-10 border-ink ring-4 ring-aqua-400',
                    )}
                    style={{ left, top, width, height }}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold', s.chip)}>{type}</span>
                      {widget?.needsReview && (
                        <span className="rounded bg-caution-50 px-1.5 py-0.5 text-[10px] font-semibold text-caution-700 ring-1 ring-caution-200">
                          Review
                        </span>
                      )}
                    </span>
                    {type === 'KPI_CARD' ? (
                      <span className="mt-1 block space-y-0.5">
                        <span className="line-clamp-1 block text-xs font-medium text-teal-700">{label}</span>
                        <span className="block text-lg font-bold tracking-tight text-ink">{widget?.kpiValue || '—'}</span>
                        {widget?.trend && (
                          <span
                            className={cn(
                              'line-clamp-1 block text-[11px] font-semibold',
                              isNegativeTrend(widget.trend) ? 'text-danger-600' : 'text-aqua-700',
                            )}
                          >
                            {widget.trend}
                          </span>
                        )}
                      </span>
                    ) : widget?.chartData && widget.chartData.length > 0 ? (
                      <span className="mt-1 block space-y-0.5 overflow-hidden">
                        {widget.chartData.slice(0, 3).map((d, i) => (
                          <span key={i} className="flex justify-between text-[11px] text-teal-700">
                            <span className="truncate">{d.label}</span>
                            <span className="ml-1 font-semibold text-ink">{d.value}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="mt-1 line-clamp-2 block text-[11px] text-teal-600">
                        {(widget?.text ?? []).slice(0, 4).join(', ') || label}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* On small screens the scaled tiles are too small to tap, so offer a list as well. */}
        <ul className="mt-4 space-y-2 sm:hidden" aria-label="Components">
          {widgets.map((w) => {
            const s = styleFor(w.componentType)
            const isSelected = selected?.id === w.id
            return (
              <li key={w.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelected(isSelected ? null : w)}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    isSelected ? 'border-ink bg-aqua-50' : 'border-teal-100 hover:bg-teal-50',
                  )}
                >
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-sm', s.chip)} />
                  <span className="min-w-0 flex-1 truncate font-medium">{w.kpiLabel || w.title || 'Untitled widget'}</span>
                  <span className="text-xs text-teal-600">{s.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Slide-over Inspector Drawer (Right side, dismiss on outside click or Esc) */}
      {selected && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="slide-over-title">
          {/* Backdrop: click anywhere outside to close */}
          <div
            className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setSelected(null)}
            aria-hidden="true"
          />

          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="w-screen max-w-md bg-white shadow-2xl border-l border-teal-200 flex flex-col animate-fade-in">
              {/* Drawer Top Bar */}
              <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50/70 px-5 py-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="grid size-8 place-items-center rounded-lg bg-teal-100 text-teal-700">
                    <MousePointerClick className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 id="slide-over-title" className="truncate text-base font-bold text-ink">
                      {selected.title || 'Component Inspector'}
                    </h3>
                    <p className="text-xs text-teal-600">Click outside to dismiss</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="grid size-8 place-items-center rounded-lg text-charcoal-500 hover:bg-teal-100 hover:text-ink transition-colors"
                  aria-label="Close inspector"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                <WidgetInspector widget={selected} onClose={() => setSelected(null)} />
              </div>

              {/* Drawer Bottom Bar */}
              <div className="border-t border-teal-100 bg-teal-50/30 p-3.5 flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
