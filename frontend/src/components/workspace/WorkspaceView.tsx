import React, { useState } from 'react'
import { Cpu, Database, HardDrive, RotateCw, Settings2, Sparkles } from 'lucide-react'
import { BackendStatus } from '../../types'
import { PipelineState } from '../../hooks/usePipeline'
import { cn } from '../../lib/cn'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { getApiBase, setCustomApiBase } from '../../services/api'
import { PackageDetailsForm } from './PackageDetailsForm'
import { PipelinePanel } from './PipelinePanel'
import { ResultPanel } from './ResultPanel'
import { SourcePanel } from './SourcePanel'

interface WorkspaceViewProps {
  pipeline: PipelineState
  status: BackendStatus | null
  isConnecting: boolean
  connectionError: string | null
  onRetryConnection: () => void
  onViewJson: (data: unknown, title: string, filename: string) => void
  onDownloadPage: () => void
}

function HeroChip({ icon: Icon, label, value, ok }: { icon: React.ElementType; label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 backdrop-blur-sm">
      <Icon aria-hidden className={cn('size-4 shrink-0', ok ? 'text-aqua-400' : 'text-teal-300')} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-300">{label}</p>
        <p className="truncate text-sm font-medium text-white">{value}</p>
      </div>
    </div>
  )
}

export function WorkspaceView({
  pipeline,
  status,
  isConnecting,
  connectionError,
  onRetryConnection,
  onViewJson,
  onDownloadPage,
}: WorkspaceViewProps) {
  const isRemoteHost = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [customApiUrl, setCustomApiUrl] = useState(() => getApiBase())

  const handleSaveApiUrl = (e: React.FormEvent) => {
    e.preventDefault()
    setCustomApiBase(customApiUrl)
    onRetryConnection()
  }

  const handleResetApiUrl = () => {
    setCustomApiBase(null)
    setCustomApiUrl('/api')
    onRetryConnection()
  }

  const storage = status?.storage
  const storageLabel = !storage
    ? '—'
    : storage.backend === 'mongodb'
      ? storage.healthy ? 'MongoDB connected' : 'MongoDB unreachable'
      : 'Local files'

  return (
    <>
      <section className="bg-brand-grid text-white" aria-labelledby="workspace-title">
        <div className="mx-auto max-w-7xl px-4 pb-28 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <div className="max-w-3xl animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-aqua-400/30 bg-aqua-400/10 px-3 py-1 text-xs font-semibold text-aqua-300">
              <Sparkles aria-hidden className="size-3.5" />
              Figma2Insight workspace
            </p>
            <h1 id="workspace-title" className="mt-5 text-3xl font-extrabold leading-tight text-white sm:text-5xl sm:leading-[1.1]">
              Turn Figma dashboards into <span className="text-aqua-400">structured insight</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-teal-200 sm:text-lg">
              Load a design, let the classifier identify KPI cards, charts and tables, and export a validated 12×12
              layout as a structured Dashboard page.json.
            </p>
          </div>
          <div className="stagger mt-8 grid gap-3 sm:grid-cols-3">
            <div style={{ ['--i' as string]: 1 }}>
              <HeroChip
                icon={Cpu}
                label="Classifier"
                value={isConnecting ? 'Checking…' : status?.modelLoaded ? 'XGBoost model ready' : 'Model unavailable'}
                ok={!!status?.modelLoaded}
              />
            </div>
            <div style={{ ['--i' as string]: 2 }}>
              <HeroChip
                icon={storage?.backend === 'mongodb' ? Database : HardDrive}
                label="Saved analyses"
                value={isConnecting ? 'Checking…' : storageLabel}
                ok={!!storage?.healthy}
              />
            </div>
            <div style={{ ['--i' as string]: 3 }}>
              <HeroChip
                icon={Sparkles}
                label="Current design"
                value={pipeline.design?.documentName ?? 'None loaded yet'}
                ok={!!pipeline.design}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {connectionError && (
          <Alert
            tone="error"
            title={isRemoteHost ? "Connecting to Render Cloud Backend" : "Can't reach the Figma2Insight API"}
            className="mb-6 shadow-card animate-fade-up"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Settings2 className="size-4" />}
                  onClick={() => setShowApiConfig(!showApiConfig)}
                >
                  {showApiConfig ? 'Hide API URL' : 'Configure API URL'}
                </Button>
                <Button variant="primary" size="sm" icon={<RotateCw className="size-4" />} onClick={onRetryConnection} loading={isConnecting}>
                  {isConnecting ? 'Waking up backend…' : 'Retry Connection'}
                </Button>
              </div>
            }
          >
            {isRemoteHost ? (
              <div className="space-y-2 text-sm text-rose-800">
                <p>
                  <strong>Render Free Tier Cold Start:</strong> Your backend is hosted at <a href="https://evernorth-figma2insight-project.onrender.com" target="_blank" rel="noreferrer" className="underline font-mono text-xs">https://evernorth-figma2insight-project.onrender.com</a>. Free instances sleep after 15 minutes of inactivity and take <strong>30–50 seconds to wake up</strong> on the first visit.
                </p>
                <p>
                  If you just opened the website, please wait a moment and click <strong>"Retry Connection"</strong> above.
                </p>
              </div>
            ) : (
              <div>
                <p>{connectionError}</p>
                <p className="mt-1">
                  Start the backend with <code className="rounded bg-rose-100 px-1 font-mono text-xs text-rose-900">python server.py</code>.
                </p>
              </div>
            )}

            {showApiConfig && (
              <form onSubmit={handleSaveApiUrl} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white/60 p-2.5 border border-rose-200">
                <label htmlFor="api-url-input" className="text-xs font-semibold text-charcoal-700">
                  Backend API URL:
                </label>
                <input
                  id="api-url-input"
                  type="text"
                  value={customApiUrl}
                  onChange={(e) => setCustomApiUrl(e.target.value)}
                  placeholder="e.g. https://my-backend.onrender.com/api"
                  className="flex-1 min-w-[240px] rounded-md border border-charcoal-300 bg-white px-2.5 py-1 text-xs text-charcoal-900 focus:border-teal-500 focus:outline-none"
                />
                <Button type="submit" size="sm" variant="primary">
                  Save & Connect
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={handleResetApiUrl}>
                  Reset
                </Button>
              </form>
            )}
          </Alert>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="stagger space-y-6 lg:col-span-5">
            <div style={{ ['--i' as string]: 0 }}>
              <SourcePanel
                design={pipeline.design}
                pluginAvailable={!!status?.pluginDataReceived}
                pluginDesignName={status?.designName ?? null}
                busy={pipeline.busy}
                onLoadPlugin={pipeline.loadFromPlugin}
                onUpload={pipeline.loadFromFile}
                onClear={pipeline.clearDesign}
              />
            </div>
            <div style={{ ['--i' as string]: 1 }}>
              <PackageDetailsForm
                value={pipeline.packageDetails}
                errors={pipeline.packageErrors}
                disabled={pipeline.busy}
                onChange={pipeline.setPackageDetails}
                onErrorsChange={pipeline.setPackageErrors}
              />
            </div>
          </div>

          <div className="stagger space-y-6 lg:col-span-7">
            <div style={{ ['--i' as string]: 2 }}>
              <PipelinePanel
                hasDesign={!!pipeline.design}
                statuses={pipeline.statuses}
                details={pipeline.details}
                error={pipeline.error}
                busy={pipeline.busy}
                runningAll={pipeline.runningAll}
                onRunStage={pipeline.runStage}
                onRunAll={pipeline.runAll}
              />
            </div>
            {pipeline.result && (
              <ResultPanel
                result={pipeline.result}
                storage={storage?.backend}
                onViewJson={() => onViewJson(pipeline.result!.pageJson, 'Dashboard page.json', 'page.json')}
                onDownload={onDownloadPage}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
