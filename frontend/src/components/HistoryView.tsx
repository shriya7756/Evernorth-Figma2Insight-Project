import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  Database,
  Download,
  Eye,
  FileText,
  HardDrive,
  MonitorPlay,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { HistoryEntry, HistoryRunDetails, JsonType, StorageBackend, VistaPageJson } from '../types'
import {
  ApiError,
  deleteHistoryRun,
  fetchHistory,
  fetchHistoryJson,
  fetchHistoryRun,
  getHistoryDownloadUrl,
} from '../services/api'
import { routeHref } from '../hooks/useHashRoute'
import { cn } from '../lib/cn'
import { downloadUrl } from '../lib/download'
import { formatDateTime, formatRelative, pluralize } from '../lib/format'
import { JsonViewerModal } from './JsonViewerModal'
import { Alert } from './ui/Alert'
import { Badge } from './ui/Badge'
import { Button, buttonClasses } from './ui/Button'
import { Card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { Modal } from './ui/Modal'
import { Spinner } from './ui/Spinner'
import { StatCard } from './ui/StatCard'
import { useToast } from './ui/Toast'

const PAGE_SIZE = 20

const JSON_TYPE_LABELS: Record<JsonType, { label: string; description: string }> = {
  page_json: { label: 'Dashboard page.json', description: 'Final dashboard page' },
  grid_layout: { label: 'Grid layout', description: '12×12 tile placement' },
  clean_predictions: { label: 'Clean predictions', description: 'Classifier output after cleanup' },
  raw_predictions: { label: 'Raw predictions', description: 'Unfiltered XGBoost output' },
  figma_data: { label: 'Figma data', description: 'Source design payload' },
}

interface HistoryViewProps {
  onOpenPreview: (pageJson: VistaPageJson, label: string) => void
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

function ReviewBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Badge tone="warning" dot>
      {count} to review
    </Badge>
  ) : (
    <Badge tone="success" dot>
      Clean
    </Badge>
  )
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-teal-100" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="skeleton size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
          <div className="skeleton hidden h-6 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  )
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onOpenPreview }) => {
  const toast = useToast()
  const searchId = useId()
  const [runs, setRuns] = useState<HistoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [storage, setStorage] = useState<StorageBackend | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  const [selected, setSelected] = useState<HistoryRunDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<HistoryEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [json, setJson] = useState<{ data: unknown; title: string; filename: string } | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(t)
  }, [query])

  const load = useCallback(async (q: string) => {
    const requestId = ++requestRef.current
    setState('loading')
    setError(null)
    try {
      const data = await fetchHistory({ q, limit: PAGE_SIZE })
      if (requestId !== requestRef.current) return // a newer search superseded this one
      setRuns(data.runs)
      setTotal(data.total)
      setStorage(data.storage)
      setState('ready')
    } catch (err) {
      if (requestId !== requestRef.current) return
      setError(errorText(err))
      setState('error')
    }
  }, [])

  useEffect(() => {
    load(debouncedQuery)
  }, [debouncedQuery, load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const data = await fetchHistory({ q: debouncedQuery, limit: PAGE_SIZE, skip: runs.length })
      setRuns((prev) => [...prev, ...data.runs.filter((r) => !prev.some((p) => p.runId === r.runId))])
      setTotal(data.total)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  const openRun = async (runId: string) => {
    setDetailLoading(runId)
    try {
      setSelected(await fetchHistoryRun(runId))
    } catch (err) {
      toast.error(errorText(err))
      if (err instanceof ApiError && err.status === 404) load(debouncedQuery)
    } finally {
      setDetailLoading(null)
    }
  }

  const viewJson = async (run: HistoryRunDetails, type: JsonType) => {
    setBusyAction(`view:${type}`)
    try {
      const data = await fetchHistoryJson(run.runId, type)
      setJson({ data, title: `${JSON_TYPE_LABELS[type].label} · ${run.designName}`, filename: `${run.runId}_${type}.json` })
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusyAction(null)
    }
  }

  const openPreview = async (run: HistoryRunDetails) => {
    setBusyAction('preview')
    try {
      const page = (await fetchHistoryJson(run.runId, 'page_json')) as VistaPageJson
      setSelected(null)
      onOpenPreview(page, `Saved · ${formatDateTime(run.timestamp)}`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusyAction(null)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteHistoryRun(confirmDelete.runId)
      setRuns((prev) => prev.filter((r) => r.runId !== confirmDelete.runId))
      setTotal((t) => Math.max(0, t - 1))
      if (selected?.runId === confirmDelete.runId) setSelected(null)
      toast.success(`Deleted “${confirmDelete.designName}”.`)
      setConfirmDelete(null)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setDeleting(false)
    }
  }

  const StorageIcon = storage === 'mongodb' ? Database : HardDrive

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold">Your analyses</h2>
              {storage && (
                <Badge tone="neutral">
                  <StorageIcon aria-hidden className="size-3.5" />
                  {storage === 'mongodb' ? 'Stored in MongoDB' : 'Stored locally'}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-teal-600">
              Every generated layout is saved with its inputs and outputs so you can revisit, preview or download it.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-72">
              <label htmlFor={searchId} className="sr-only">
                Search analyses by design name
              </label>
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-teal-500" />
              <input
                id={searchId}
                type="search"
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by design name"
                className="h-11 w-full rounded-xl border border-teal-200 bg-white pl-10 pr-10 text-sm text-ink placeholder:text-teal-400 transition-colors hover:border-teal-300 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-teal-500 hover:bg-teal-100 hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button
              variant="secondary"
              icon={<RotateCw className={cn('size-4', state === 'loading' && 'animate-spin')} />}
              onClick={() => load(debouncedQuery)}
              disabled={state === 'loading'}
            >
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden" aria-busy={state === 'loading'}>
        {state === 'loading' && (
          <>
            <span className="sr-only" role="status">
              Loading saved analyses…
            </span>
            <SkeletonRows />
          </>
        )}

        {state === 'error' && (
          <div className="p-5 sm:p-6">
            <Alert
              tone="error"
              title="Saved analyses couldn't be loaded"
              action={
                <Button variant="secondary" size="sm" icon={<RotateCw className="size-4" />} onClick={() => load(debouncedQuery)}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          </div>
        )}

        {state === 'ready' && runs.length === 0 && (
          debouncedQuery ? (
            <EmptyState
              icon={Search}
              title={`No analyses match “${debouncedQuery}”`}
              description="Try a different design name, or clear the search to see everything."
              action={
                <Button variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Clock}
              title="No saved analyses yet"
              description="Generate a layout in the workspace and it will be saved here automatically."
              action={
                <a href={routeHref('workspace')} className={buttonClasses('primary')}>
                  Start an analysis
                  <ArrowRight aria-hidden className="size-4" />
                </a>
              }
            />
          )
        )}

        {state === 'ready' && runs.length > 0 && (
          <>
            <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_5rem_5rem_minmax(0,1.2fr)_2.5rem] gap-4 border-b border-teal-100 bg-teal-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-teal-600 md:grid">
              <span>Design</span>
              <span>Created</span>
              <span className="text-right">Widgets</span>
              <span className="text-right">Tiles</span>
              <span>Status</span>
              <span className="sr-only">Open</span>
            </div>
            <ul className="stagger divide-y divide-teal-100">
              {runs.map((run, i) => (
                <li key={run.runId} style={{ ['--i' as string]: Math.min(i, 8) }}>
                  <button
                    type="button"
                    onClick={() => openRun(run.runId)}
                    disabled={detailLoading !== null}
                    className="group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-teal-50 focus-visible:bg-teal-50 disabled:opacity-70 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_5rem_5rem_minmax(0,1.2fr)_2.5rem]"
                  >
                    <span className="flex min-w-0 items-center gap-3 max-md:contents">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-700 transition-colors group-hover:bg-aqua-400 group-hover:text-ink">
                        <FileText aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{run.designName}</span>
                        <span className="block font-mono text-xs text-teal-500">{run.runId}</span>
                        <span className="mt-1 block text-xs text-teal-600 md:hidden">
                          {formatRelative(run.timestamp)} · {pluralize(run.widgetCount, 'widget')}
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-sm text-teal-700 md:block" title={formatDateTime(run.timestamp)}>
                      {formatRelative(run.timestamp)}
                    </span>
                    <span className="hidden text-right text-sm font-semibold tabular-nums md:block">{run.widgetCount}</span>
                    <span className="hidden text-right text-sm font-semibold tabular-nums md:block">{run.tileCount}</span>
                    <span className="hidden md:block">
                      <ReviewBadge count={run.needAttention} />
                    </span>
                    <span className="grid size-9 place-items-center justify-self-end rounded-lg text-teal-500 transition-all group-hover:translate-x-0.5 group-hover:text-ink">
                      {detailLoading === run.runId ? <Spinner className="size-4" /> : <ChevronRight aria-hidden className="size-5" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-center gap-3 border-t border-teal-100 px-5 py-4 text-sm text-teal-600 sm:flex-row sm:justify-between">
              <span>
                Showing {runs.length} of {pluralize(total, 'analysis', 'analyses')}
              </span>
              {runs.length < total && (
                <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Run details */}
      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.designName ?? ''}
        description={selected ? `Run ${selected.runId} · ${formatDateTime(selected.timestamp)}` : undefined}
        footer={
          selected && (
            <>
              <Button
                variant="ghost"
                className="mr-auto text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                icon={<Trash2 className="size-4" />}
                onClick={() => setConfirmDelete(selected)}
              >
                Delete
              </Button>
              {selected.availableOutputs.page_json && (
                <Button icon={<MonitorPlay className="size-4" />} loading={busyAction === 'preview'} onClick={() => openPreview(selected)}>
                  Open in preview
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-6 p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Components" value={selected.componentCount} />
              <StatCard label="Widgets" value={selected.widgetCount} />
              <StatCard label="Tiles" value={selected.tileCount} />
              <StatCard label="Need review" value={selected.needAttention} tone={selected.needAttention > 0 ? 'warning' : 'default'} icon={selected.needAttention > 0 ? AlertTriangle : undefined} />
            </div>

            {selected.packageDetails && (
              <section aria-labelledby="pkg-heading">
                <h3 id="pkg-heading" className="text-sm font-bold">Package details</h3>
                <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-xl border border-teal-100 bg-teal-50/60 p-4 text-sm sm:grid-cols-2">
                  {(
                    [
                      ['Title', selected.packageDetails.title],
                      ['Slide ID', selected.packageDetails.slideId],
                      ['Subject area', selected.packageDetails.subjectArea],
                      ['Topic', selected.packageDetails.topic],
                      ['Slide name', selected.packageDetails.slideName],
                    ] as const
                  ).map(([term, value]) => (
                    <div key={term} className="flex justify-between gap-3">
                      <dt className="text-teal-600">{term}</dt>
                      <dd className="truncate font-medium text-ink">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section aria-labelledby="outputs-heading">
              <h3 id="outputs-heading" className="text-sm font-bold">Outputs</h3>
              <ul className="mt-3 space-y-2">
                {(Object.keys(JSON_TYPE_LABELS) as JsonType[]).map((type) => {
                  const available = selected.availableOutputs[type]
                  return (
                    <li
                      key={type}
                      className={cn(
                        'flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center sm:justify-between',
                        available ? 'border-teal-200 bg-white' : 'border-dashed border-teal-200 bg-teal-50/50',
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cn('text-sm font-semibold', !available && 'text-teal-500')}>{JSON_TYPE_LABELS[type].label}</p>
                        <p className="text-xs text-teal-600">{available ? JSON_TYPE_LABELS[type].description : 'Not available for this run'}</p>
                      </div>
                      {available && (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Eye className="size-4" />}
                            loading={busyAction === `view:${type}`}
                            disabled={busyAction !== null}
                            onClick={() => viewJson(selected, type)}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Download className="size-4" />}
                            onClick={() => downloadUrl(getHistoryDownloadUrl(selected.runId, type))}
                          >
                            Download
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        size="sm"
        isOpen={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        title="Delete this analysis?"
        description={confirmDelete?.designName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} loading={deleting} onClick={handleDelete}>
              Delete analysis
            </Button>
          </>
        }
      >
        <p className="p-5 text-sm leading-relaxed text-teal-700 sm:p-6">
          The run summary and all of its saved outputs will be permanently removed. This can't be undone.
        </p>
      </Modal>

      <JsonViewerModal
        isOpen={!!json}
        onClose={() => setJson(null)}
        title={json?.title ?? ''}
        jsonData={json?.data}
        downloadFilename={json?.filename}
      />
    </div>
  )
}
