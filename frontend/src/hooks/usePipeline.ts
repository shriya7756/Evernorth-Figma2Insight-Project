import { useCallback, useState } from 'react'
import { LayoutResult, LoadedDesign, PackageDetails } from '../types'
import { ApiError, loadPluginData, runClassify, runGenerateLayout, runNormalize, runPreprocess, uploadFigmaFile } from '../services/api'
import { DEFAULT_PACKAGE, PackageErrors, validatePackageDetails } from '../lib/validation'
import { pluralize } from '../lib/format'
import { STAGES, StageKey, StageStatus } from '../components/workspace/PipelinePanel'
import { useToast } from '../components/ui/Toast'

const initialStatuses = (): Record<StageKey, StageStatus> => ({
  normalize: 'pending',
  preprocess: 'pending',
  classify: 'pending',
  layout: 'pending',
})

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

/** Owns the workspace flow: design source, package details, the four pipeline stages and the result. */
export function usePipeline() {
  const toast = useToast()
  const [design, setDesign] = useState<LoadedDesign | null>(null)
  const [statuses, setStatuses] = useState(initialStatuses)
  const [details, setDetails] = useState<Partial<Record<StageKey, string>>>({})
  const [error, setError] = useState<{ stage: StageKey; message: string } | null>(null)
  const [running, setRunning] = useState<StageKey | null>(null)
  const [runningAll, setRunningAll] = useState(false)
  const [result, setResult] = useState<LayoutResult | null>(null)
  const [packageDetails, setPackageDetails] = useState<PackageDetails>(DEFAULT_PACKAGE)
  const [packageErrors, setPackageErrors] = useState<PackageErrors>({})

  const resetPipeline = useCallback(() => {
    setStatuses(initialStatuses())
    setDetails({})
    setError(null)
    setResult(null)
  }, [])

  const acceptDesign = useCallback(
    (loaded: LoadedDesign) => {
      setDesign(loaded)
      resetPipeline()
      toast.success(`Loaded “${loaded.documentName}” (${pluralize(loaded.nodeCount, 'layer')}).`)
    },
    [resetPipeline, toast],
  )

  const loadFromPlugin = useCallback(async () => acceptDesign(await loadPluginData()), [acceptDesign])
  const loadFromFile = useCallback(async (file: File) => acceptDesign(await uploadFigmaFile(file)), [acceptDesign])

  const clearDesign = useCallback(() => {
    setDesign(null)
    resetPipeline()
  }, [resetPipeline])

  const execute = useCallback(
    async (stage: StageKey): Promise<boolean> => {
      if (!design) return false
      // Only send figmaJson if present; if null/server-cached, the server reads the uploaded design from its store.
      const source = design.figmaJson ? { figmaJson: design.figmaJson } : {}

      if (stage === 'layout') {
        const problems = validatePackageDetails(packageDetails)
        if (Object.values(problems).some(Boolean)) {
          setPackageErrors(problems)
          setStatuses((prev) => ({ ...prev, layout: 'error' }))
          setError({ stage, message: 'Some package details need attention. Fix the highlighted fields, then retry.' })
          return false
        }
      }

      const index = STAGES.findIndex((s) => s.key === stage)
      setRunning(stage)
      setError(null)
      setStatuses((prev) => {
        const next = { ...prev }
        STAGES.forEach((s, i) => {
          if (i > index) next[s.key] = 'pending'
        })
        next[stage] = 'in_progress'
        return next
      })
      // Any re-run invalidates the generated layout.
      setResult(null)

      try {
        let summary = ''
        if (stage === 'normalize') {
          const res = await runNormalize(source)
          summary = `${pluralize(res.candidateCount, 'candidate')} found`
        } else if (stage === 'preprocess') {
          const res = await runPreprocess(source)
          summary = `Features extracted for ${pluralize(res.totalFeatures, 'component')}`
        } else if (stage === 'classify') {
          const res = await runClassify(source)
          summary = `${pluralize(res.candidateCount, 'component')} classified`
        } else {
          const res = await runGenerateLayout({ ...source, packageDetails })
          setResult(res)
          summary = `${pluralize(res.stats.widgets, 'widget')} on ${pluralize(res.stats.tiles, 'tile')}`
          if (res.saved) toast.success('Dashboard generated and saved to your analyses.')
          else toast.error('Dashboard generated, but it could not be saved. Storage is unavailable.')
        }
        setDetails((prev) => ({ ...prev, [stage]: summary }))
        setStatuses((prev) => ({ ...prev, [stage]: 'completed' }))
        return true
      } catch (err) {
        if (err instanceof ApiError && err.fieldErrors.length) {
          const mapped: PackageErrors = {}
          err.fieldErrors.forEach(({ field, message }) => {
            const key = field.replace(/^packageDetails\./, '') as keyof PackageDetails
            if (key in DEFAULT_PACKAGE) mapped[key] = message
          })
          setPackageErrors((prev) => ({ ...prev, ...mapped }))
        }
        setStatuses((prev) => ({ ...prev, [stage]: 'error' }))
        setError({ stage, message: errorMessage(err, 'The stage could not be completed. Please try again.') })
        return false
      } finally {
        setRunning(null)
      }
    },
    [design, packageDetails, toast],
  )

  const runStage = useCallback((stage: StageKey) => void execute(stage), [execute])

  const runAll = useCallback(async () => {
    const start = STAGES.findIndex((s) => statuses[s.key] !== 'completed')
    if (start === -1) return
    setRunningAll(true)
    try {
      for (const stage of STAGES.slice(start)) {
        if (!(await execute(stage.key))) return
      }
    } finally {
      setRunningAll(false)
    }
  }, [execute, statuses])

  return {
    design,
    statuses,
    details,
    error,
    busy: running !== null || runningAll,
    runningAll,
    result,
    packageDetails,
    packageErrors,
    setPackageDetails,
    setPackageErrors,
    loadFromPlugin,
    loadFromFile,
    clearDesign,
    runStage,
    runAll,
  }
}

export type PipelineState = ReturnType<typeof usePipeline>
