
export interface GridPosition {
  colOffset: number
  colSpan: number
  rowOffset: number
  rowSpan: number
}

export interface CandidateComponent {
  candidate_id: string
  name: string
  type?: string
  x: number
  y: number
  width: number
  height: number
  text_preview?: string[]
  candidate_score?: number
}

export interface PredictedComponent extends CandidateComponent {
  predicted_type: 'CHART' | 'KPI_CARD' | 'TABLE' | 'FILTER' | 'HEADER' | 'OTHER'
  confidence?: number
}

export interface VistaTile {
  tileId: string
  id?: string
  contentId: string
  slideId: string
  cols: number
  rows: number
  colOffset?: number
  rowOffset?: number
  widgetIds: string[]
  widgetId?: string
  grid: GridPosition
}

export interface AbsolutePosition {
  x: number
  y: number
  width: number
  height: number
}

export interface VistaWidget {
  id: string
  widgetId: string
  type: string
  componentType: string
  title: string
  semanticLabel?: string
  sourceComponentId?: string
  grid: GridPosition
  position?: AbsolutePosition
  text?: string[]
  chartData?: Array<{ label: string; value: number }>

  // KPI content
  kpiValue?: string
  kpiLabel?: string
  supportingText?: string
  trend?: string

  needsReview?: boolean
  chart?: Record<string, unknown>
  annotations?: Record<string, unknown>
  dataRequest?: Record<string, unknown>

  tableConfig?: {
    columns: string[]
    rows?: unknown[]
  }
}

export interface VistaPageJson {
  contentId: string
  slideId: string
  pageId: string
  id?: string
  title: string
  description: string
  subjectArea?: string
  topic?: string
  slideName?: string
  schemaVersion?: string
  format?: string
  dashboard?: {
    id: string
    name: string
    columns: number
    rows: number
    sourceWidth: number
    sourceHeight: number
  }
  tiles: VistaTile[]
  widgets: VistaWidget[]
  backgroundPaths?: unknown[]
  validation: {
    componentCount: number
    widgetCount: number
    tileCount: number
    reviewRequired: number
    validationErrors?: string[]
  }
}

export interface PackageDetails {
  subjectArea: string
  topic: string
  slideName: string
  slideId: string
  title: string
}

export interface PipelineResult {
  success: boolean
  designName: string
  contentId: string
  slideId: string
  pageId: string
  executionTimeMs: number
  sourceDimensions: { width: number; height: number }
  nodeCount: number
  candidateCount: number
  sourceComponents: Array<{
    id: string
    name: string
    type: string
    x: number
    y: number
    width: number
    height: number
    textPreview: string[]
  }>
  normalizedJson: {
    dashboard: string
    candidate_count: number
    candidates: CandidateComponent[]
  }
  classifierJson: {
    candidate_count: number
    predictions: PredictedComponent[]
  }
  gridLayout: {
    dashboard_id: string
    dashboard_name: string
    grid: { columns: number; rows: number }
    dashboard_size: { width: number; height: number }
    component_count: number
    components: Array<{
      candidate_id: string
      name: string
      predicted_type: string
      grid: GridPosition
      position_relative_to_dashboard: {
        x: number
        y: number
        width: number
        height: number
      }
    }>
  }
  pageJson: VistaPageJson
  stats: {
    widgets: number
    tiles: number
    needAttention: number
    infoNotes: number
    validationErrors: number
    classifier: string
  }
  runId?: string
}

export type StorageBackend = 'mongodb' | 'file'

export interface BackendStatus {
  status: string
  modelLoaded: boolean
  modelFile: string
  classes: string[]
  pipelineStages: string[]
  pluginDataReceived: boolean
  designName: string | null
  storage?: { backend: StorageBackend; healthy: boolean }
  timestamp: number
}

export interface LoadedDesign {
  documentName: string
  nodeCount: number
  dimensions: { width: number; height: number }
  figmaJson: unknown
  filename?: string
  source: 'plugin' | 'upload'
}

export interface LayoutResult {
  success: boolean
  stage: 'generate-layout'
  runId: string
  saved: boolean
  gridLayout: PipelineResult['gridLayout']
  pageJson: VistaPageJson
  stats: { widgets: number; tiles: number; needAttention: number }
}

export type JsonType = 'figma_data' | 'raw_predictions' | 'clean_predictions' | 'grid_layout' | 'page_json'

export interface HistoryEntry {
  runId: string
  designName: string
  timestamp: string
  componentCount: number
  widgetCount: number
  tileCount: number
  needAttention: number
  status: string
  packageDetails?: Partial<PackageDetails> | null
}

export interface HistoryList {
  runs: HistoryEntry[]
  total: number
  storage: StorageBackend
}

export interface HistoryRunDetails extends HistoryEntry {
  availableOutputs: Record<JsonType, boolean>
}
