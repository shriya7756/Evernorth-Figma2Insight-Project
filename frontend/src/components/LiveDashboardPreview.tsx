import React from 'react'
import { ArrowLeft, Clock, Download, ExternalLink, Eye, Layers } from 'lucide-react'
import { VistaPageJson } from '../types'
import { routeHref } from '../hooks/useHashRoute'
import { AbsoluteLayoutViewer } from './AbsoluteLayoutViewer'
import { Badge } from './ui/Badge'
import { Button, buttonClasses } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Card } from './ui/Card'

interface LiveDashboardPreviewProps {
  pageJson: VistaPageJson | null
  sourceLabel?: string
  onViewJson?: () => void
  onDownload?: () => void
}

export const LiveDashboardPreview: React.FC<LiveDashboardPreviewProps> = ({ pageJson, sourceLabel, onViewJson, onDownload }) => {
  if (!pageJson || !pageJson.widgets || pageJson.widgets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Layers}
          title="No dashboard to preview yet"
          description="Run the pipeline in the workspace, or open a saved analysis, and the generated layout will appear here."
          action={
            <>
              <a href={routeHref('workspace')} className={buttonClasses('primary')}>
                <ArrowLeft aria-hidden className="size-4" />
                Go to workspace
              </a>
              <a href={routeHref('history')} className={buttonClasses('secondary')}>
                <Clock aria-hidden className="size-4" />
                Saved analyses
              </a>
            </>
          }
        />
      </Card>
    )
  }

  const dashboardSize = {
    width: pageJson.dashboard?.sourceWidth || 1440,
    height: pageJson.dashboard?.sourceHeight || 1024,
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold">{pageJson.title || 'Generated dashboard'}</h2>
            {sourceLabel && <Badge tone="success">{sourceLabel}</Badge>}
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-teal-600">
            <div className="flex gap-1.5">
              <dt>Slide ID</dt>
              <dd className="font-mono font-medium text-ink">{pageJson.slideId}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Widgets</dt>
              <dd className="font-medium text-ink">{pageJson.widgets.length}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Need review</dt>
              <dd className="font-medium text-ink">{pageJson.validation?.reviewRequired ?? 0}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          {onViewJson && (
            <Button variant="secondary" icon={<Eye className="size-4" />} onClick={onViewJson}>
              View JSON
            </Button>
          )}
          {onDownload && (
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={onDownload}>
              Download
            </Button>
          )}
          <a href="/dashboard_preview.html" target="_blank" rel="noopener noreferrer" className={buttonClasses('dark')}>
            <ExternalLink aria-hidden className="size-4" />
            Standalone preview
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </Card>

      <AbsoluteLayoutViewer tiles={pageJson.tiles} widgets={pageJson.widgets} dashboardSize={dashboardSize} />
    </div>
  )
}
