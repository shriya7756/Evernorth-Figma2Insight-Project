import {
  BackendStatus,
  HistoryList,
  HistoryRunDetails,
  JsonType,
  LayoutResult,
  LoadedDesign,
} from '../types'
import { toPackagePayload } from '../lib/validation'
import type { PackageDetails } from '../types'

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = window.localStorage.getItem('f2i_api_base')
    if (custom) return custom.trim().replace(/\/+$/, '')
  }
  const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (envBase) return envBase.trim().replace(/\/+$/, '')
  return '/api'
}

export function setCustomApiBase(url: string | null) {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      window.localStorage.setItem('f2i_api_base', url.trim().replace(/\/+$/, ''))
    } else {
      window.localStorage.removeItem('f2i_api_base')
    }
  }
}

const DEFAULT_TIMEOUT_MS = 30_000
const PIPELINE_TIMEOUT_MS = 180_000

export interface FieldError {
  field: string
  message: string
}

/** An API failure with a user-presentable message. */
export class ApiError extends Error {
  status: number
  fieldErrors: FieldError[]

  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }

  /** Network failures, timeouts and 5xx responses are worth retrying. */
  get retryable() {
    return this.status === 0 || this.status === 408 || this.status >= 500
  }
}

function fallbackMessage(status: number): string {
  if (status === 404) return 'The requested item could not be found.'
  if (status === 413) return 'The file is too large.'
  if (status === 503) return 'The service is temporarily unavailable. Please try again shortly.'
  if (status >= 500) return 'Something went wrong on the server. Please try again.'
  return 'The request could not be completed.'
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; parse?: 'json' | 'none' } = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, parse = 'json', ...options } = init
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  const base = getApiBase()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const targetUrl = `${base}${cleanPath}`

  let res: Response
  try {
    res = await fetch(targetUrl, { ...options, signal: controller.signal })
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    throw new ApiError(
      timedOut
        ? 'The request took too long. Please try again.'
        : 'Could not reach the Figma2Insight API. Check that the backend server is running.',
      timedOut ? 408 : 0,
    )
  } finally {
    window.clearTimeout(timer)
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new ApiError(
      'The API returned an HTML page instead of JSON. Netlify only serves the static frontend UI. To run Figma2Insight, start "python server.py" and use http://localhost:8001 or configure a backend API URL.',
      502,
    )
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: unknown; errors?: FieldError[] } | null
    const detail = typeof body?.detail === 'string' ? body.detail : fallbackMessage(res.status)
    throw new ApiError(detail, res.status, Array.isArray(body?.errors) ? body.errors : [])
  }
  return (parse === 'json' ? res.json() : undefined) as Promise<T>
}

function postJson<T>(path: string, body: unknown, timeoutMs = PIPELINE_TIMEOUT_MS) {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs,
  })
}

// ---------------------------------------------------------------------------
// Status & design sources
// ---------------------------------------------------------------------------

export function fetchBackendStatus() {
  return request<BackendStatus>('/status', { timeoutMs: 60_000 })
}

export async function loadPluginData(): Promise<LoadedDesign> {
  const data = await request<Omit<LoadedDesign, 'source'>>('/load-plugin-data', { timeoutMs: 60_000 })
  return { ...data, source: 'plugin' }
}

export async function uploadFigmaFile(file: File): Promise<LoadedDesign> {
  const formData = new FormData()
  formData.append('file', file)
  const data = await request<Omit<LoadedDesign, 'source'>>('/upload', {
    method: 'POST',
    body: formData,
    timeoutMs: 120_000,
  })
  return { ...data, source: 'upload' }
}

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

type StageParams = { figmaJson?: unknown }

export function runNormalize(params: StageParams) {
  return postJson<{ candidateCount: number; documentName: string }>('/normalize', params)
}

export function runPreprocess(params: StageParams) {
  return postJson<{ candidateCount: number; totalFeatures: number }>('/preprocess', params)
}

export function runClassify(params: StageParams) {
  return postJson<{ candidateCount: number }>('/classify', params)
}

export function runGenerateLayout(params: StageParams & { packageDetails?: PackageDetails }) {
  const { packageDetails, ...rest } = params
  return postJson<LayoutResult>('/generate-layout', {
    ...rest,
    ...(packageDetails ? { packageDetails: toPackagePayload(packageDetails) } : {}),
  })
}

export function getDownloadPageUrl(): string {
  return `${getApiBase()}/download/page.json`
}

// ---------------------------------------------------------------------------
// Saved analyses (history)
// ---------------------------------------------------------------------------

export function fetchHistory(params: { q?: string; limit?: number; skip?: number } = {}) {
  const query = new URLSearchParams()
  if (params.q?.trim()) query.set('q', params.q.trim().slice(0, 100))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.skip) query.set('skip', String(params.skip))
  const qs = query.toString()
  return request<HistoryList>(`/history${qs ? `?${qs}` : ''}`)
}

export function fetchHistoryRun(runId: string) {
  return request<HistoryRunDetails>(`/history/${encodeURIComponent(runId)}`)
}

export function fetchHistoryJson(runId: string, jsonType: JsonType) {
  return request<unknown>(`/history/${encodeURIComponent(runId)}/json/${jsonType}`, { timeoutMs: 60_000 })
}

export function deleteHistoryRun(runId: string) {
  return request<{ success: boolean }>(`/history/${encodeURIComponent(runId)}`, { method: 'DELETE' })
}

export function getHistoryDownloadUrl(runId: string, jsonType: JsonType): string {
  return `${getApiBase()}/history/${encodeURIComponent(runId)}/download/${jsonType}`
}
