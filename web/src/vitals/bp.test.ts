import { describe, expect, it } from 'vitest'
import { BP_CATEGORIES, BP_CATEGORY_LABELS, BP_CATEGORY_RANGES, BP_NOTE, bpCategory } from './bp'

describe('bpCategory (AHA chart, 2017 ACC/AHA guideline)', () => {
  it.each([
    [119, 79, 'normal'],
    [90, 60, 'normal'],
    [120, 79, 'elevated'],
    [129, 79, 'elevated'],
    [130, 79, 'stage1'],
    [139, 70, 'stage1'],
    [119, 80, 'stage1'],
    [125, 89, 'stage1'],
    [140, 70, 'stage2'],
    [118, 90, 'stage2'],
    [180, 120, 'stage2'],
    [181, 100, 'crisis'],
    [150, 121, 'crisis'],
    [200, 130, 'crisis'],
  ] as const)('%i/%i is %s', (sys, dia, category) => {
    expect(bpCategory(sys, dia)).toBe(category)
  })

  it('takes the higher category of the two numbers', () => {
    // Systolic says elevated, diastolic says stage 2.
    expect(bpCategory(125, 95)).toBe('stage2')
    // Diastolic alone never makes a reading "elevated".
    expect(bpCategory(110, 79)).toBe('normal')
  })

  it('needs both numbers', () => {
    expect(bpCategory(undefined, 80)).toBeUndefined()
    expect(bpCategory(120, undefined)).toBeUndefined()
  })
})

describe('BP copy guardrails (#256)', () => {
  const copy = [...Object.values(BP_CATEGORY_LABELS), ...Object.values(BP_CATEGORY_RANGES), BP_NOTE].join('\n')

  it('has a label and a range for every category', () => {
    for (const c of BP_CATEGORIES) {
      expect(BP_CATEGORY_LABELS[c]).toBeTruthy()
      expect(BP_CATEGORY_RANGES[c]).toBeTruthy()
    }
  })

  it('says it is not a diagnosis, cites its source and points to the clinician', () => {
    expect(BP_NOTE).toMatch(/not a diagnosis/)
    expect(BP_NOTE).toMatch(/American Heart Association/)
    expect(BP_NOTE).toMatch(/Log and share with your clinician/)
  })

  it('gives no advice or instructions', () => {
    expect(copy).not.toMatch(/\b(should|must|call|seek|emergency|immediately|doctor|treat|cure|diagnosed|danger|warning)\b/i)
  })
})
