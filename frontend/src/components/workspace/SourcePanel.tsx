import { useId, useRef, useState } from 'react'
import { FileJson, Plug, RefreshCcw, UploadCloud } from 'lucide-react'
import { LoadedDesign } from '../../types'
import { cn } from '../../lib/cn'
import { formatBytes } from '../../lib/format'
import { validateDesignFile } from '../../lib/validation'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { FigmaJsonHelp } from './FigmaJsonHelp'

type Source = 'plugin' | 'upload'

/** An import code can be shared as a link: #/workspace?code=3f9a1c2b */
function initialImportCode(): string {
  if (typeof window === 'undefined') return ''
  const query = window.location.hash.split('?')[1] ?? ''
  return (new URLSearchParams(query).get('code') ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
}

interface SourcePanelProps {
  design: LoadedDesign | null
  pluginDesignName: string | null
  pluginAvailable: boolean
  /** Upload limit reported by the API; defaults to 50 MB. */
  maxUploadMb?: number
  busy: boolean
  onLoadPlugin: (importCode?: string) => Promise<void>
  onUpload: (file: File) => Promise<void>
  onClear: () => void
}

export function SourcePanel({
  design,
  pluginDesignName,
  pluginAvailable,
  maxUploadMb = 50,
  busy,
  onLoadPlugin,
  onUpload,
  onClear,
}: SourcePanelProps) {
  const [source, setSource] = useState<Source>('plugin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [importCode, setImportCode] = useState(() => initialImportCode())
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const headingId = useId()

  const run = async (task: () => Promise<void>) => {
    setLoading(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const problem = validateDesignFile(file, maxUploadMb * 1024 * 1024)
    setPendingFile(file)
    if (problem) {
      setError(problem)
      return
    }
    run(() => onUpload(file))
  }

  if (design) {
    return (
      <Card className="p-5 sm:p-6" aria-labelledby={headingId}>
        <CardHeader
          id={headingId}
          eyebrow="Step 1 · Source design"
          title="Design loaded"
          actions={
            <Button variant="secondary" size="sm" icon={<RefreshCcw className="size-4" />} onClick={onClear} disabled={busy}>
              Change design
            </Button>
          }
        />
        <div className="mt-5 flex items-start gap-4 rounded-xl border border-aqua-200 bg-aqua-50/60 p-4 animate-fade-in">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-aqua-400">
            {design.source === 'plugin' ? <Plug className="size-5" /> : <FileJson className="size-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink" title={design.documentName}>
              {design.documentName}
            </p>
            <p className="mt-0.5 truncate text-sm text-teal-600">
              {design.source === 'plugin' ? 'Sent from the Figma plugin' : design.filename}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{design.nodeCount.toLocaleString()} layers</Badge>
              {design.dimensions?.width > 0 && (
                <Badge>
                  {Math.round(design.dimensions.width)} × {Math.round(design.dimensions.height)} px
                </Badge>
              )}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 sm:p-6" aria-labelledby={headingId}>
      <CardHeader
        id={headingId}
        eyebrow="Step 1 · Source design"
        title="Choose a Figma design"
        description="Send a page from the Figma plugin or upload a JSON export."
      />

      <div role="tablist" aria-label="Design source" className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-teal-100 p-1">
        {([
          ['plugin', 'Figma plugin', Plug],
          ['upload', 'Upload JSON', UploadCloud],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${inputId}-tab-${value}`}
            aria-selected={source === value}
            aria-controls={`${inputId}-panel`}
            tabIndex={source === value ? 0 : -1}
            onClick={() => {
              setSource(value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
              e.preventDefault()
              const other: Source = value === 'plugin' ? 'upload' : 'plugin'
              setSource(other)
              setError(null)
              document.getElementById(`${inputId}-tab-${other}`)?.focus()
            }}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-200',
              source === value ? 'bg-white text-ink shadow-sm' : 'text-teal-600 hover:text-ink',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div id={`${inputId}-panel`} role="tabpanel" aria-labelledby={`${inputId}-tab-${source}`} className="mt-5">
        {source === 'plugin' ? (
          <div key="plugin" className="animate-fade-in space-y-4">
            <p className="text-sm leading-relaxed text-teal-700">
              In Figma, run the <strong>Figma2Insight</strong> plugin, select the dashboard frame and choose{' '}
              <em>Send to Figma2Insight</em>. Enter the import code it shows to load your design.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (importCode.trim()) run(() => onLoadPlugin(importCode.trim()))
              }}
            >
              <label htmlFor={`${inputId}-code`} className="sr-only">
                Import code
              </label>
              <input
                id={`${inputId}-code`}
                value={importCode}
                onChange={(e) => setImportCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64))}
                placeholder="Import code, e.g. 3f9a1c2b"
                autoComplete="off"
                spellCheck={false}
                disabled={loading || busy}
                className="h-11 min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3.5 font-mono text-sm text-ink placeholder:font-sans placeholder:text-teal-400 transition-[border-color,box-shadow] duration-200 hover:border-teal-300 focus-visible:border-teal-700 disabled:cursor-not-allowed disabled:bg-teal-50"
              />
              <Button type="submit" loading={loading && !!importCode.trim()} disabled={busy || !importCode.trim()}>
                Load
              </Button>
            </form>
            {pluginAvailable && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Latest from plugin</p>
                <p className="mt-1 truncate font-semibold text-ink">{pluginDesignName || 'Untitled design'}</p>
              </div>
            )}
            <Button
              className="w-full"
              variant={pluginAvailable ? 'primary' : 'secondary'}
              onClick={() => run(() => onLoadPlugin())}
              loading={loading && !importCode.trim()}
              disabled={busy}
              icon={<Plug className="size-4" />}
            >
              {loading ? 'Loading design…' : pluginAvailable ? 'Use latest plugin design' : 'Check for plugin design'}
            </Button>
          </div>
        ) : (
          <div key="upload" className="animate-fade-in">
            <label
              htmlFor={inputId}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                handleFile(e.dataTransfer.files?.[0])
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200',
                'has-[:focus-visible]:border-teal-700 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-aqua-300',
                dragging ? 'scale-[1.01] border-aqua-500 bg-aqua-50' : 'border-teal-200 bg-teal-50/60 hover:border-teal-400 hover:bg-teal-50',
                (loading || busy) && 'pointer-events-none opacity-60',
              )}
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-white text-teal-700 shadow-card">
                <UploadCloud aria-hidden className="size-6" />
              </span>
              <span className="mt-3 text-sm font-semibold text-ink">
                {loading ? 'Validating design…' : 'Drop a Figma JSON file, or browse'}
              </span>
              <span className="mt-1 text-xs text-teal-600">.json up to {maxUploadMb} MB · Figma REST export or plugin payload</span>
              {pendingFile && (
                <span className="mt-3 max-w-full truncate rounded-full bg-white px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-200">
                  {pendingFile.name} · {formatBytes(pendingFile.size)}
                </span>
              )}
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                disabled={loading || busy}
                onChange={(e) => {
                  handleFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            <FigmaJsonHelp />
          </div>
        )}
      </div>

      {error && (
        <Alert
          tone={error.includes('page.json output') ? 'warning' : 'error'}
          title={error.includes('page.json output') ? 'Wrong file type' : "We couldn't load that design"}
          className="mt-4"
          action={
            source === 'upload' ? (
              <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                Choose another file
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => run(() => onLoadPlugin(importCode.trim() || undefined))}
              >
                Try again
              </Button>
            )
          }
        >
          {error}
        </Alert>
      )}
    </Card>
  )
}
