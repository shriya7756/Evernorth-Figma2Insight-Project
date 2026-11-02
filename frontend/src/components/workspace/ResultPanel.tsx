import { useId } from 'react'
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, Database, Download, Eye, LayoutGrid } from 'lucide-react'
import { LayoutResult, StorageBackend } from '../../types'
import { routeHref } from '../../hooks/useHashRoute'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button, buttonClasses } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
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

  return (
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
            <Badge tone="dark" className="self-start sm:self-center">
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
          <StatCard style={{ ['--i' as string]: 0 }} label="Widgets" value={stats.widgets} icon={Boxes} />
          <StatCard style={{ ['--i' as string]: 1 }} label="Tiles" value={stats.tiles} icon={LayoutGrid} />
          <StatCard
            style={{ ['--i' as string]: 2 }}
            label="Need review"
            value={stats.needAttention}
            icon={AlertTriangle}
            tone={stats.needAttention > 0 ? 'warning' : 'default'}
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
  )
}
