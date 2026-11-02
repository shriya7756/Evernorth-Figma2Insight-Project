import { describe, expect, it } from 'vitest'
import { DEFAULT_PACKAGE, toPackagePayload, validateDesignFile, validatePackageDetails } from './validation'

describe('validatePackageDetails', () => {
  it('accepts the defaults', () => {
    expect(validatePackageDetails(DEFAULT_PACKAGE)).toEqual({})
  })

  it('accepts a blank or 5-character slide ID', () => {
    expect(validatePackageDetails({ ...DEFAULT_PACKAGE, slideId: 'cr001' }).slideId).toBeUndefined()
    expect(validatePackageDetails({ ...DEFAULT_PACKAGE, slideId: '  ' }).slideId).toBeUndefined()
  })

  it('rejects malformed values with readable messages', () => {
    const errors = validatePackageDetails({
      subjectArea: '',
      topic: 'Has Spaces',
      slideName: 'under_score',
      slideId: 'AB-12',
      title: 'x'.repeat(121),
    })
    expect(errors.subjectArea).toMatch(/required/)
    expect(errors.topic).toMatch(/lowercase/)
    expect(errors.slideName).toMatch(/lowercase/)
    expect(errors.slideId).toMatch(/5 letters or numbers/)
    expect(errors.title).toMatch(/120/)
  })
})

describe('toPackagePayload', () => {
  it('normalises values and omits blanks', () => {
    expect(
      toPackagePayload({ subjectArea: ' Sales ', topic: 'ops', slideName: 'a-b', slideId: 'cr001', title: '  ' }),
    ).toEqual({ subjectArea: 'sales', topic: 'ops', slideName: 'a-b', slideId: 'CR001' })
  })
})

describe('validateDesignFile', () => {
  it('requires a non-empty .json file under the size limit', () => {
    expect(validateDesignFile({ name: 'design.json', size: 10 })).toBeNull()
    expect(validateDesignFile({ name: 'DESIGN.JSON', size: 10 })).toBeNull()
    expect(validateDesignFile({ name: 'design.fig', size: 10 })).toMatch(/\.json/)
    expect(validateDesignFile({ name: 'design.json', size: 0 })).toMatch(/empty/)
    expect(validateDesignFile({ name: 'design.json', size: 60 * 1024 * 1024 })).toMatch(/50 MB/)
  })
})
