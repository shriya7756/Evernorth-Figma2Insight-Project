import { describe, expect, it } from 'vitest'
import { formatBytes, formatRelative, pluralize } from './format'
import { parseRoute } from '../hooks/useHashRoute'

describe('formatRelative', () => {
  const now = new Date('2026-11-02T12:00:00Z')

  it('describes recent times in plain language', () => {
    expect(formatRelative('2026-11-02T11:59:40Z', now)).toBe('just now')
    expect(formatRelative('2026-11-02T11:55:00Z', now)).toBe('5 min ago')
    expect(formatRelative('2026-11-02T09:00:00Z', now)).toBe('3 h ago')
    expect(formatRelative('2026-10-31T12:00:00Z', now)).toBe('2 d ago')
  })

  it('handles invalid input', () => {
    expect(formatRelative('not a date', now)).toBe('—')
  })
})

describe('formatBytes', () => {
  it('uses binary units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB')
  })
})

describe('pluralize', () => {
  it('picks the right form', () => {
    expect(pluralize(1, 'widget')).toBe('1 widget')
    expect(pluralize(3, 'analysis', 'analyses')).toBe('3 analyses')
  })
})

describe('parseRoute', () => {
  it('maps hashes to known routes and falls back to the workspace', () => {
    expect(parseRoute('#/history')).toBe('history')
    expect(parseRoute('#/preview?x=1')).toBe('preview')
    expect(parseRoute('#main')).toBe('workspace')
    expect(parseRoute('')).toBe('workspace')
  })
})
