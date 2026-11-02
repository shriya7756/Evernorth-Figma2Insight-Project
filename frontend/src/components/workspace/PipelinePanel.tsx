import { useId } from 'react'
import { AlertCircle, Check, Play, RotateCw, Zap } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Spinner } from '../ui/Spinner'

export const STAGES = [
  { key: 'normalize', title: 'Normalize', description: 'Find component candidates in the design tree.' },
  { key: 'preprocess', title: 'Extract features', description: 'Compute 20 geometric, text and graphic features.' },
  { key: 'classify', title: 'Classify components', description: 'XGBoost labels KPI cards, charts, tables and more.' },
  { key: 'layout', title: 'Generate layout', description: 'Map to a 12×12 grid and assemble Vista page.json.' },
] as const

export type StageKey = (typeof STAGES)[number]['key']
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'error'

interface PipelinePanelProps {
  hasDesign: boolean
  statuses: Record<StageKey, StageStatus>
  details: Partial<Record<StageKey, string>>
  error: { stage: StageKey; message: string } | null
  busy: boolean
  runningAll: boolean
  onRunStage: (stage: StageKey) => void
  onRunAll: () => void
}

export function PipelinePanel({ hasDesign, statuses, details, error, busy, runningAll, onRunStage, onRunAll }: PipelinePanelProps) {
  const headingId = useId()
  const completed = STAGES.filter((s) => statuses[s.key] === 'completed').length
  const nextIndex = STAGES.findIndex((s) => statuses[s.key] !== 'completed')
  const allDone = nextIndex === -1

  const canRun = (index: number) => hasDesign && !busy && (index === 0 || statuses[STAGES[index - 1].key] === 'completed')

  return (
    <Card className="p-5 sm:p-6" aria-labelledby={headingId} aria-busy={busy}>
      <CardHeader
        id={headingId}
        eyebrow="Step 3 · Processing pipeline"
        title="Run the analysis"
        description={
          hasDesign
            ? 'Run each stage in order, or let Figma2Insight run everything that remains.'
            : 'Load a design first — the stages unlock once a source is ready.'
        }
        actions={
          <Button
            onClick={onRunAll}
            disabled={!hasDesign || busy || allDone}
            loading={runningAll}
            icon={<Zap className="size-4" />}
          >
            {allDone ? 'All stages complete' : completed > 0 ? 'Run remaining stages' : 'Run full pipeline'}
          </Button>
        }
      />

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-medium text-teal-600">
          <span id={`${headingId}-progress`}>
            {completed} of {STAGES.length} stages complete
          </span>
          <span className="tabular-nums">{Math.round((completed / STAGES.length) * 100)}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-teal-100"
          role="progressbar"
          aria-labelledby={`${headingId}-progress`}
          aria-valuemin={0}
          aria-valuemax={STAGES.length}
          aria-valuenow={completed}
        >
          <div
            className="h-full rounded-full bg-aqua-500 transition-[width] duration-500 ease-out-soft"
            style={{ width: `${(completed / STAGES.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="stagger mt-6 space-y-3">
        {STAGES.map((stage, index) => {
          const status = statuses[stage.key]
          const runnable = canRun(index)
          const isNext = index === nextIndex
          return (
            <li
              key={stage.key}
              style={{ ['--i' as string]: index }}
              className={cn(
                'relative flex flex-col gap-3 rounded-xl border p-4 transition-colors duration-300 sm:flex-row sm:items-center',
                status === 'completed' && 'border-aqua-200 bg-aqua-50/50',
                status === 'in_progress' && 'border-teal-400 bg-teal-50',
                status === 'error' && 'border-danger-200 bg-danger-50/60',
                status === 'pending' && (isNext && hasDesign ? 'border-teal-300 bg-white' : 'border-teal-100 bg-white'),
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-300',
                    status === 'completed' && 'bg-aqua-400 text-ink',
                    status === 'in_progress' && 'bg-ink text-aqua-400',
                    status === 'error' && 'bg-danger-600 text-white',
                    status === 'pending' && 'bg-teal-100 text-teal-600',
                  )}
                >
                  {status === 'completed' && <Check className="size-4" strokeWidth={3} />}
                  {status === 'in_progress' && <Spinner className="size-4" />}
                  {status === 'error' && <AlertCircle className="size-4" />}
                  {status === 'pending' && index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {stage.title}
                    <span className="sr-only">
                      {' '}
                      — {status === 'in_progress' ? 'running' : status === 'error' ? 'failed' : status}
                    </span>
                  </p>
                  <p className="text-sm text-teal-600">{stage.description}</p>
                  {details[stage.key] && status === 'completed' && (
                    <p className="mt-1 text-xs font-semibold text-aqua-700 animate-fade-in">{details[stage.key]}</p>
                  )}
                </div>
              </div>
              <Button
                variant={status === 'completed' ? 'ghost' : isNext && runnable ? 'dark' : 'secondary'}
                size="sm"
                className="self-start sm:self-center"
                disabled={!runnable}
                onClick={() => onRunStage(stage.key)}
                icon={status === 'completed' || status === 'error' ? <RotateCw className="size-4" /> : <Play className="size-4" />}
                aria-label={`${status === 'completed' ? 'Run again' : status === 'error' ? 'Retry' : 'Run'}: ${stage.title}`}
              >
                {status === 'completed' ? 'Run again' : status === 'error' ? 'Retry' : status === 'in_progress' ? 'Running…' : 'Run'}
              </Button>
            </li>
          )
        })}
      </ol>

      {error && (
        <Alert
          tone="error"
          className="mt-4"
          title={`${STAGES.find((s) => s.key === error.stage)?.title} failed`}
          action={
            <Button variant="secondary" size="sm" icon={<RotateCw className="size-4" />} onClick={() => onRunStage(error.stage)} disabled={busy}>
              Retry
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}
    </Card>
  )
}
