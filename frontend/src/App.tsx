import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { LiveDashboardPreview } from './components/LiveDashboardPreview'
import { StudentGuideView } from './components/StudentGuideView'
import { HistoryView } from './components/HistoryView'
import { JsonViewerModal } from './components/JsonViewerModal'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { ToastProvider } from './components/ui/Toast'
import { fetchBackendStatus, getDownloadPageUrl } from './services/api'
import { Route, useHashRoute } from './hooks/useHashRoute'
import { usePipeline } from './hooks/usePipeline'
import { downloadJson, downloadUrl } from './lib/download'
import { BackendStatus, VistaPageJson } from './types'

const PAGE_META: Record<Route, { title: string; heading?: string; description?: string }> = {
  workspace: { title: 'Workspace' },
  preview: {
    title: 'Dashboard preview',
    heading: 'Dashboard preview',
    description: 'The generated layout, drawn with the original Figma geometry. Select a tile to inspect it.',
  },
  history: {
    title: 'Saved analyses',
    heading: 'Saved analyses',
    description: 'Browse, preview, download or remove previous runs.',
  },
  guide: {
    title: 'Guide',
    heading: 'Guide & specification',
    description: 'The grid rules, widget mapping and validation checks behind every generated page.json.',
  },
}

function PageHeader({ heading, description }: { heading: string; description?: string }) {
  return (
    <div className="bg-brand-grid text-white">
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 sm:pt-12 lg:px-8">
        <h1 className="animate-fade-up text-3xl font-extrabold text-white sm:text-4xl">{heading}</h1>
        {description && <p className="mt-2 max-w-2xl animate-fade-up text-teal-200 [animation-delay:60ms]">{description}</p>}
      </div>
    </div>
  )
}

function AppContent() {
  const [route] = useHashRoute()
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null)
  const [isConnecting, setIsConnecting] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const pipeline = usePipeline()

  // A saved analysis opened from history takes over the preview until a new layout is generated.
  const [savedPreview, setSavedPreview] = useState<{ page: VistaPageJson; label: string } | null>(null)
  const [json, setJson] = useState<{ data: unknown; title: string; filename: string } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  const checkStatus = useCallback(async () => {
    setIsConnecting(true)
    try {
      setBackendStatus(await fetchBackendStatus())
      setConnectionError(null)
    } catch (err) {
      setBackendStatus(null)
      setConnectionError(err instanceof Error ? err.message : 'The API is unreachable.')
    } finally {
      setIsConnecting(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  useEffect(() => {
    if (pipeline.result) setSavedPreview(null)
  }, [pipeline.result])

  // Route change: update the title, scroll to top and move focus for screen-reader users.
  useEffect(() => {
    document.title = `${PAGE_META[route].title} · Figma2Insight`
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    // 'instant' overrides the global smooth scrolling, which the content swap would interrupt.
    window.scrollTo({ top: 0, behavior: 'instant' })
    mainRef.current?.focus({ preventScroll: true })
  }, [route])

  const previewPage = savedPreview?.page ?? pipeline.result?.pageJson ?? null
  const meta = PAGE_META[route]

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar route={route} status={backendStatus} isConnecting={isConnecting} />

      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 outline-none">
        <div key={route} className="animate-page-in">
          {route === 'workspace' && (
            <WorkspaceView
              pipeline={pipeline}
              status={backendStatus}
              isConnecting={isConnecting}
              connectionError={connectionError}
              onRetryConnection={checkStatus}
              onViewJson={(data, title, filename) => setJson({ data, title, filename })}
              onDownloadPage={() => downloadUrl(getDownloadPageUrl())}
            />
          )}

          {route !== 'workspace' && meta.heading && <PageHeader heading={meta.heading} description={meta.description} />}

          {route === 'preview' && (
            <div className="mx-auto -mt-12 max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
              <LiveDashboardPreview
                pageJson={previewPage}
                sourceLabel={savedPreview?.label ?? (pipeline.result ? 'Latest run' : undefined)}
                onViewJson={previewPage ? () => setJson({ data: previewPage, title: 'Vista page.json', filename: 'page.json' }) : undefined}
                onDownload={previewPage ? () => downloadJson(previewPage, `${previewPage.slideId || 'page'}_page.json`) : undefined}
              />
            </div>
          )}

          {route === 'history' && (
            <div className="mx-auto -mt-12 max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
              <HistoryView
                onOpenPreview={(page, label) => {
                  setSavedPreview({ page, label })
                  window.location.hash = '#/preview'
                }}
              />
            </div>
          )}

          {route === 'guide' && (
            <div className="-mt-12">
              <StudentGuideView />
            </div>
          )}
        </div>
      </main>

      <Footer />

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

export const App: React.FC = () => (
  <ToastProvider>
    <AppContent />
  </ToastProvider>
)

export default App
