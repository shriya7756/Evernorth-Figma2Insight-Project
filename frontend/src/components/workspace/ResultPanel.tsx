import { useId, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  Download,
  Eye,
  ExternalLink,
  LayoutGrid,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { LayoutResult, StorageBackend, VistaWidget } from '../../types'
import { routeHref } from '../../hooks/useHashRoute'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button, buttonClasses } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Modal } from '../ui/Modal'
import { StatCard } from '../ui/StatCard'

interface ResultPanelProps {
  result: LayoutResult
  storage?: StorageBackend
  onViewJson: () => void
  onDownload: () => void
}

export function ResultPanel({ result, storage, onViewJson, onDownload }: ResultPanelProps) {
  const headingId = useId()
  const { stats, pageJson } = result
  const [inspectTab, setInspectTab] = useState<'widgets' | 'tiles' | 'review' | null>(null)

  const widgets = pageJson.widgets || []
  const tiles = pageJson.tiles || []
  const reviewWidgets = widgets.filter((w) => w.needsReview)

  return (
    <>
      <Card className="overflow-hidden animate-fade-up" aria-labelledby={headingId}>
        <div className="bg-brand-grid px-5 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-aqua-400 text-ink">
                <CheckCircle2 aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 id={headingId} className="text-lg font-bold text-white">
                  Dashboard generated
                </h2>
                <p className="truncate text-sm text-teal-200">{pageJson.title}</p>
              </div>
            </div>
            {result.saved ? (
              <Badge tone="dark" className="self-start sm:self-center" title={`Run ID: ${result.runId} — Safe reference ID stored in MongoDB`}>
                <Database aria-hidden className="size-3.5 text-aqua-400" />
                Saved {storage === 'mongodb' ? 'to MongoDB' : 'locally'} · {result.runId}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {!result.saved && (
            <Alert tone="warning" title="Generated, but not saved" className="mb-5">
              The analysis storage was unavailable, so this run is not in Saved analyses. You can still preview and
              download the result.
            </Alert>
          )}

          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              style={{ ['--i' as string]: 0 }}
              label="Widgets"
              value={stats.widgets}
              icon={Boxes}
              onClick={() => setInspectTab('widgets')}
            />
            <StatCard
              style={{ ['--i' as string]: 1 }}
              label="Tiles"
              value={stats.tiles}
              icon={LayoutGrid}
              onClick={() => setInspectTab('tiles')}
            />
            <StatCard
              style={{ ['--i' as string]: 2 }}
              label="Need review"
              value={stats.needAttention}
              icon={AlertTriangle}
              tone={stats.needAttention > 0 ? 'warning' : 'default'}
              onClick={() => setInspectTab('review')}
            />
          </div>

          <CardHeader
            className="mt-6"
            title={<span className="text-base">Slide {pageJson.slideId}</span>}
            description={`${pageJson.subjectArea ?? '—'} / ${pageJson.topic ?? '—'} / ${pageJson.slideName ?? '—'}`}
          />

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href={routeHref('preview')} className={buttonClasses('primary', 'md', 'sm:flex-1')}>
              Open dashboard preview
              <ArrowRight aria-hidden className="size-4" />
            </a>
            <Button variant="secondary" icon={<Eye className="size-4" />} onClick={onViewJson}>
              View page.json
            </Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={onDownload}>
              Download
            </Button>
          </div>
        </div>
      </Card>

      {/* Detailed Inspection Modal */}
      <Modal
        isOpen={inspectTab !== null}
        onClose={() => setInspectTab(null)}
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-teal-600" />
            <span>Dashboard Inspector</span>
          </div>
        }
        description={
          <div className="mt-2 flex flex-wrap gap-2 border-b border-charcoal-200 pb-2">
            <button
              type="button"
              onClick={() => setInspectTab('widgets')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                inspectTab === 'widgets'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-charcoal-600 hover:bg-charcoal-100'
              }`}
            >
              All Widgets ({widgets.length})
            </button>
            <button
              type="button"
              onClick={() => setInspectTab('tiles')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                inspectTab === 'tiles'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-charcoal-600 hover:bg-charcoal-100'
              }`}
            >
              12×12 Grid Tiles ({tiles.length})
            </button>
            <button
              type="button"
              onClick={() => setInspectTab('review')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
                inspectTab === 'review'
                  ? 'bg-caution-600 text-white shadow-xs'
                  : 'text-caution-800 bg-caution-50 hover:bg-caution-100'
              }`}
            >
              <AlertTriangle className="size-3.5" />
              Need Review ({reviewWidgets.length})
            </button>
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-charcoal-500">
              Slide ID: <strong className="font-mono text-charcoal-800">{pageJson.slideId}</strong>
            </span>
            <div className="flex gap-2">
              <a
                href={routeHref('preview')}
                onClick={() => setInspectTab(null)}
                className={buttonClasses('primary', 'sm')}
              >
                Open in Canvas Preview
                <ExternalLink className="size-3.5 ml-1" />
              </a>
              <Button size="sm" variant="ghost" onClick={() => setInspectTab(null)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
          {/* TAB 1: ALL WIDGETS */}
          {inspectTab === 'widgets' && (
            <div className="space-y-3">
              {widgets.map((widget: VistaWidget, index: number) => (
                <div
                  key={widget.id || index}
                  className="rounded-xl border border-charcoal-200 bg-white p-3.5 shadow-xs hover:border-teal-300 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                        {widget.componentType || widget.type}
                      </span>
                      <h4 className="text-sm font-bold text-ink">{widget.title || 'Untitled Component'}</h4>
                    </div>
                    {widget.needsReview && (
                      <span className="inline-flex items-center gap-1 rounded bg-caution-100 px-2 py-0.5 text-[11px] font-semibold text-caution-800">
                        <AlertTriangle className="size-3" />
                        Needs Review
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 bg-charcoal-50 p-2.5 rounded-lg border border-charcoal-100">
                    <div>
                      <span className="text-charcoal-500 block text-[10px] uppercase">Grid Span</span>
                      <span className="font-semibold text-charcoal-800">
                        {widget.grid ? `${widget.grid.colSpan} cols × ${widget.grid.rowSpan} rows` : 'Auto'}
                      </span>
                    </div>
                    <div>
                      <span className="text-charcoal-500 block text-[10px] uppercase">Grid Position</span>
                      <span className="font-mono text-charcoal-800">
                        {widget.grid ? `(${widget.grid.colOffset}, ${widget.grid.rowOffset})` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-charcoal-500 block text-[10px] uppercase">Figma Size</span>
                      <span className="font-mono text-charcoal-800">
                        {widget.position ? `${Math.round(widget.position.width)}×${Math.round(widget.position.height)} px` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-charcoal-500 block text-[10px] uppercase">Widget ID</span>
                      <span className="font-mono text-charcoal-800 truncate block">{widget.id || widget.widgetId}</span>
                    </div>
                  </div>

                  {widget.kpiValue && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-charcoal-700">
                      <TrendingUp className="size-3.5 text-teal-600" />
                      <span>
                        KPI Value: <strong className="text-ink">{widget.kpiValue}</strong>
                        {widget.trend ? ` (${widget.trend})` : ''}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: TILES */}
          {inspectTab === 'tiles' && (
            <div className="space-y-3">
              <p className="text-xs text-charcoal-600">
                The 12×12 grid divides the slide canvas into 12 equal vertical columns and 12 horizontal rows. Below are the allocated slots:
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {tiles.map((tile, i) => (
                  <div
                    key={tile.tileId || i}
                    className="rounded-xl border border-charcoal-200 bg-white p-3.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="size-4 text-teal-600" />
                        <h4 className="text-sm font-bold text-ink">{tile.tileId}</h4>
                      </div>
                      <span className="font-mono text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {tile.cols}×{tile.rows}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-charcoal-600 space-y-1">
                      <p>
                        Col Range: <strong className="text-charcoal-900 font-mono">{tile.grid ? `${tile.grid.colOffset} → ${tile.grid.colOffset + tile.grid.colSpan}` : `span ${tile.cols}`}</strong>
                      </p>
                      <p>
                        Row Range: <strong className="text-charcoal-900 font-mono">{tile.grid ? `${tile.grid.rowOffset} → ${tile.grid.rowOffset + tile.grid.rowSpan}` : `span ${tile.rows}`}</strong>
                      </p>
                      <p className="truncate text-charcoal-500">
                        Linked Widgets: {tile.widgetIds?.join(', ') || '1'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: NEED REVIEW */}
          {inspectTab === 'review' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-caution-50 p-3 border border-caution-200 text-xs text-caution-900">
                <strong>Why these components need review:</strong>
                <p className="mt-1 text-caution-800">
                  The XGBoost classifier or geometric sanity checks flagged {reviewWidgets.length} component(s) with lower classification confidence or borderline bounding box aspect ratios.
                </p>
              </div>

              {reviewWidgets.length === 0 ? (
                <div className="text-center py-6 text-charcoal-500 text-sm">
                  🎉 No components currently require manual review! All confidence scores are high.
                </div>
              ) : (
                reviewWidgets.map((widget, i) => (
                  <div
                    key={widget.id || i}
                    className="rounded-xl border border-caution-300 bg-white p-4 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-caution-600" />
                        <h4 className="text-sm font-bold text-ink">{widget.title || 'Flagged Component'}</h4>
                      </div>
                      <span className="rounded bg-caution-100 px-2 py-0.5 text-xs font-bold text-caution-800">
                        Labeled as: {widget.componentType || widget.type}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-charcoal-600">
                      <strong>Inspection recommendation:</strong> Check if this component should remain a{' '}
                      <code className="rounded bg-charcoal-100 px-1 py-0.5 text-xs font-mono">{widget.componentType}</code> or be re-assigned in the dashboard preview.
                    </p>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-charcoal-500 pt-2 border-t border-charcoal-100">
                      <span>Dimensions: {widget.position ? `${Math.round(widget.position.width)} × ${Math.round(widget.position.height)} px` : 'Auto'}</span>
                      <a
                        href={routeHref('preview')}
                        onClick={() => setInspectTab(null)}
                        className="text-teal-700 hover:text-teal-900 font-semibold underline"
                      >
                        Highlight in Preview →
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
