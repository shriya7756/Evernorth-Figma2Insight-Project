import { PackageDetails } from '../types'

// Mirrors backend/schemas.py so users see problems before submitting.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLIDE_ID_PATTERN = /^[A-Z0-9]{5}$/
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export type PackageErrors = Partial<Record<keyof PackageDetails, string>>

export const DEFAULT_PACKAGE: PackageDetails = {
  subjectArea: 'sales',
  topic: 'analytics',
  slideName: 'dashboard-summary',
  slideId: '',
  title: '',
}

function slugError(label: string, value: string, maxLength: number): string | undefined {
  const v = value.trim()
  if (!v) return `${label} is required.`
  if (v.length > maxLength) return `${label} must be ${maxLength} characters or fewer.`
  if (!SLUG_PATTERN.test(v)) return `Use lowercase letters, numbers and single hyphens (e.g. "${label === 'Slide name' ? 'revenue-summary' : 'sales'}").`
  return undefined
}

export function validatePackageDetails(details: PackageDetails): PackageErrors {
  const errors: PackageErrors = {}
  const subject = slugError('Subject area', details.subjectArea, 40)
  if (subject) errors.subjectArea = subject
  const topic = slugError('Topic', details.topic, 40)
  if (topic) errors.topic = topic
  const slide = slugError('Slide name', details.slideName, 60)
  if (slide) errors.slideName = slide

  const slideId = details.slideId.trim().toUpperCase()
  if (slideId && !SLIDE_ID_PATTERN.test(slideId)) {
    errors.slideId = 'Slide ID must be exactly 5 letters or numbers (e.g. CR001), or left blank to auto-generate.'
  }
  if (details.title.trim().length > 120) {
    errors.title = 'Title must be 120 characters or fewer.'
  }
  return errors
}

/** Shape sent to the API: trimmed, normalised, blanks omitted. */
export function toPackagePayload(details: PackageDetails) {
  const slideId = details.slideId.trim().toUpperCase()
  const title = details.title.trim()
  return {
    subjectArea: details.subjectArea.trim().toLowerCase(),
    topic: details.topic.trim().toLowerCase(),
    slideName: details.slideName.trim().toLowerCase(),
    ...(slideId ? { slideId } : {}),
    ...(title ? { title } : {}),
  }
}

/** Basic client-side checks before a Figma JSON file is read and uploaded. */
export function validateDesignFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!file.name.toLowerCase().endsWith('.json')) {
    return 'Choose a .json file exported from Figma or the Figma2Insight plugin.'
  }
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'This file is larger than the 50 MB limit.'
  return null
}
