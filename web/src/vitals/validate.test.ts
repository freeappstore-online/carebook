import { describe, expect, it } from 'vitest'
import { normalizeReadingInput } from './validate'

const base = { date: '2026-10-16', time: '08:30' }

describe('normalizeReadingInput', () => {
  it('keeps a full reading', () => {
    expect(
      normalizeReadingInput({
        ...base,
        systolic: 128,
        diastolic: 82,
        pulse: 64,
        arm: 'left',
        position: 'sitting',
        weight: { value: 72.46, unit: 'kg' },
        glucose: { value: 5.4, unit: 'mmol/L' },
        notes: '  after a walk ',
      }),
    ).toEqual({
      ...base,
      systolic: 128,
      diastolic: 82,
      pulse: 64,
      arm: 'left',
      position: 'sitting',
      weight: { value: 72.5, unit: 'kg' },
      glucose: { value: 5.4, unit: 'mmol/L' },
      notes: 'after a walk',
    })
  })

  it('accepts a single measurement and drops arm and position without blood pressure', () => {
    expect(normalizeReadingInput({ ...base, weight: { value: 160, unit: 'lb' }, arm: 'left' })).toEqual({
      ...base,
      weight: { value: 160, unit: 'lb' },
      notes: '',
    })
    expect(normalizeReadingInput({ ...base, pulse: '70' })).toEqual({ ...base, pulse: 70, notes: '' })
    expect(normalizeReadingInput({ ...base, glucose: { value: 99, unit: 'mg/dL' }, weight: { value: undefined, unit: 'kg' } })).toEqual({
      ...base,
      glucose: { value: 99, unit: 'mg/dL' },
      notes: '',
    })
  })

  it('names the field that is wrong', () => {
    const bad: [Record<string, unknown>, string][] = [
      [{}, 'reading'],
      [{ date: '2026-02-30', pulse: 60 }, 'date'],
      [{ time: '25:00', pulse: 60 }, 'time'],
      [{ systolic: 120 }, 'diastolic'],
      [{ diastolic: 80 }, 'systolic'],
      [{ systolic: 80, diastolic: 120 }, 'diastolic'],
      [{ systolic: 1200, diastolic: 80 }, 'systolic'],
      [{ systolic: 120.5, diastolic: 80 }, 'systolic'],
      [{ systolic: 'abc', diastolic: 80 }, 'systolic'],
      [{ pulse: 7 }, 'pulse'],
      [{ weight: { value: 9000, unit: 'kg' } }, 'weight'],
      [{ weight: { value: 70, unit: 'stone' } }, 'weight'],
      [{ glucose: { value: 5000, unit: 'mg/dL' } }, 'glucose'],
      [{ glucose: { value: -1, unit: 'mmol/L' } }, 'glucose'],
      [{ systolic: 120, diastolic: 80, arm: 'leg' }, 'arm'],
      [{ systolic: 120, diastolic: 80, position: 'upside down' }, 'position'],
      [{ pulse: 60, notes: 'x'.repeat(501) }, 'notes'],
    ]
    for (const [patch, field] of bad) {
      expect(() => normalizeReadingInput({ ...base, ...patch }), JSON.stringify(patch)).toThrow(
        expect.objectContaining({ field }),
      )
    }
  })
})
