import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MousePointerClick, X } from 'lucide-react'
import { VistaTile, VistaWidget } from '../types'
import { cn } from '../lib/cn'
import { Badge } from './ui/Badge'

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

  // Fit the canvas to its container; ResizeObserver also reacts to sidebar/layout changes.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setScale(Math.min(1, el.clientWidth / dashboardSize.width))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [dashboardSize.width])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    widgets.forEach((w) => {
      const key = TYPE_STYLES[w.componentType] ? w.componentType : 'OTHER'
      counts[key] = (counts[key] ?? 0) + 1
    })
    return counts
  }, [widgets])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
            {Math.round(dashboardSize.width)}×{Math.round(dashboardSize.height)} px · {(scale * 100).toFixed(0)}%
          </p>
        </div>

        <div ref={containerRef} className="mt-4 w-full overflow-hidden">
          {/* Reserve the scaled size so the transformed canvas never causes horizontal overflow. */}
          <div style={{ width: dashboardSize.width * scale, height: dashboardSize.height * scale }}>
            <div
              className="relative origin-top-left rounded-xl bg-teal-50 ring-1 ring-teal-200"
              style={{ width: dashboardSize.width, height: dashboardSize.height, transform: `scale(${scale})` }}
            >
              {tiles.map((tile, idx) => {
                const widgetId = tile.widgetId || tile.widgetIds?.[0]
                const widget = widgetId ? widgetMap.get(widgetId) : undefined
                const type = widget?.componentType || 'OTHER'
                const s = styleFor(type)
                const label = widget?.kpiLabel || widget?.semanticLabel || widget?.title || 'Untitled widget'
                const isSelected = !!widget && selected?.id === widget.id

                // Use grid position (12×12) if available, fall back to Figma absolute px
                const grid = tile.grid ?? widget?.grid
                const W = dashboardSize.width
                const H = dashboardSize.height
                const COLS = 12
                const ROWS = 12
                const GAP = 6 // px gap between tiles

                let left: number, top: number, width: number, height: number
                if (grid) {
                  const cellW = (W - GAP * (COLS + 1)) / COLS
                  const cellH = (H - GAP * (ROWS + 1)) / ROWS
                  left = GAP + grid.colOffset * (cellW + GAP)
                  top = GAP + grid.rowOffset * (cellH + GAP)
                  width = grid.colSpan * cellW + (grid.colSpan - 1) * GAP
                  height = grid.rowSpan * cellH + (grid.rowSpan - 1) * GAP
                } else {
                  const pos = widget?.position
                  left = pos?.x ?? 0
                  top = pos?.y ?? 0
                  width = pos?.width ?? 100
                  height = pos?.height ?? 100
                }

                return (
                  <button
                    type="button"
                    key={tile.tileId || tile.id || idx}
                    disabled={!widget}
                    onClick={() => setSelected(isSelected ? null : widget ?? null)}
                    aria-pressed={isSelected}
                    aria-label={`${s.label}: ${label}`}
                    className={cn(
                      'absolute flex flex-col overflow-hidden rounded-lg border p-2.5 text-left shadow-sm',
                      'transition-[box-shadow,border-color,transform] duration-200 hover:z-10 hover:-translate-y-px hover:shadow-raised',
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
                      <span className="mt-1.5 block space-y-0.5">
                        <span className="line-clamp-2 block text-xs font-medium text-teal-700">{label}</span>
                        <span className="block text-xl font-bold tracking-tight text-ink">{widget?.kpiValue || '—'}</span>
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
                      <span className="mt-1.5 block space-y-0.5 overflow-hidden">
                        {widget.chartData.slice(0, 4).map((d, i) => (
                          <span key={i} className="flex justify-between text-[11px] text-teal-700">
                            <span className="truncate">{d.label}</span>
                            <span className="ml-1 font-semibold text-ink">{d.value}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="mt-1.5 line-clamp-3 block text-[11px] text-teal-600">
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

      <aside className="h-fit rounded-2xl border border-teal-200/80 bg-white p-5 shadow-card xl:sticky xl:top-24" aria-live="polite">
        {selected ? (
          <WidgetInspector widget={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-teal-100 text-teal-600">
              <MousePointerClick aria-hidden className="size-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">Inspect a component</p>
            <p className="mt-1 text-sm text-teal-600">Select any tile to see its type, values and source geometry.</p>
          </div>
        )}
      </aside>
    </div>
  )
}
