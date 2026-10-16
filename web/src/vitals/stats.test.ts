import { describe, expect, it } from 'vitest'
import { linePath, niceTicks, plot } from './chart'
import { averages, fmt, inRange, preferredUnits, series, summarize, windowRange } from './stats'
import { type Reading, glucoseIn, toKg, weightIn } from './types'

let n = 0
function reading(extra: Partial<Reading>): Reading {
  n++
  return { id: `r${n}`, takenAt: n * 1000, date: '2026-10-16', time: '08:00', notes: '', createdAt: 0, updatedAt: 0, ...extra }
}

describe('windows', () => {
  it('covers the last N days including today', () => {
    expect(windowRange('2026-10-16', 7)).toEqual({ from: '2026-10-10', to: '2026-10-16' })
    expect(windowRange('2026-10-16', 30)).toEqual({ from: '2026-09-17', to: '2026-10-16' })
    expect(windowRange('2026-03-01', 90)).toEqual({ from: '2025-12-02', to: '2026-03-01' })
  })

  it('filters readings by date, inclusive', () => {
    const range = windowRange('2026-10-16', 7)
    expect(inRange(reading({ date: '2026-10-10' }), range)).toBe(true)
    expect(inRange(reading({ date: '2026-10-09' }), range)).toBe(false)
    expect(inRange(reading({ date: '2026-10-16' }), range)).toBe(true)
  })
})

describe('summarize', () => {
  it('gives count, mean, min and max', () => {
    expect(summarize([120, 130, 140])).toEqual({ count: 3, mean: 130, min: 120, max: 140 })
    expect(summarize([])).toBeUndefined()
  })
})

describe('averages', () => {
  it('averages each measurement over the readings that have it', () => {
    const readings = [
      reading({ systolic: 120, diastolic: 80, pulse: 60 }),
      reading({ systolic: 130, diastolic: 85 }),
      reading({ pulse: 70, weight: { value: 80, unit: 'kg' } }),
      reading({ glucose: { value: 5.5, unit: 'mmol/L' } }),
    ]
    const avg = averages(readings, { weight: 'kg', glucose: 'mmol/L' })
    expect(avg.readings).toBe(4)
    expect(avg.systolic).toEqual({ count: 2, mean: 125, min: 120, max: 130 })
    expect(avg.diastolic?.mean).toBe(82.5)
    expect(avg.pulse).toEqual({ count: 2, mean: 65, min: 60, max: 70 })
    expect(avg.weight).toMatchObject({ count: 1, mean: 80, unit: 'kg' })
    expect(avg.glucose).toMatchObject({ count: 1, mean: 5.5, unit: 'mmol/L' })
  })

  it('converts mixed units before averaging', () => {
    const readings = [
      reading({ weight: { value: 70, unit: 'kg' } }),
      reading({ weight: { value: 176.4, unit: 'lb' } }), // ≈ 80 kg
      reading({ glucose: { value: 90, unit: 'mg/dL' } }), // ≈ 5.0 mmol/L
      reading({ glucose: { value: 6, unit: 'mmol/L' } }),
    ]
    const kg = averages(readings, { weight: 'kg', glucose: 'mmol/L' })
    expect(kg.weight?.mean).toBeCloseTo(75, 1)
    expect(kg.glucose?.mean).toBeCloseTo(5.5, 1)
    const lb = averages(readings, { weight: 'lb', glucose: 'mg/dL' })
    expect(lb.weight?.mean).toBeCloseTo(165.4, 0)
    expect(lb.glucose?.mean).toBeCloseTo(99, 0)
  })

  it('leaves out what was never measured', () => {
    const avg = averages([reading({ pulse: 72 })], { weight: 'kg', glucose: 'mmol/L' })
    expect(avg).toEqual({ readings: 1, systolic: undefined, diastolic: undefined, pulse: { count: 1, mean: 72, min: 72, max: 72 } })
    expect(averages([], { weight: 'kg', glucose: 'mmol/L' }).readings).toBe(0)
  })
})

describe('units', () => {
  it('converts weight and glucose both ways', () => {
    expect(toKg({ value: 220.462, unit: 'lb' })).toBeCloseTo(100, 3)
    expect(weightIn({ value: 100, unit: 'kg' }, 'lb')).toBeCloseTo(220.462, 3)
    expect(glucoseIn({ value: 5, unit: 'mmol/L' }, 'mg/dL')).toBeCloseTo(90.08, 2)
    expect(glucoseIn({ value: 180.16, unit: 'mg/dL' }, 'mmol/L')).toBeCloseTo(10, 2)
  })

  it('prefers the units of the latest readings', () => {
    expect(preferredUnits([])).toEqual({ weight: 'kg', glucose: 'mmol/L' })
    const readings = [
      reading({ takenAt: 1, weight: { value: 70, unit: 'kg' }, glucose: { value: 5, unit: 'mmol/L' } }),
      reading({ takenAt: 3, weight: { value: 150, unit: 'lb' } }),
      reading({ takenAt: 2, glucose: { value: 99, unit: 'mg/dL' } }),
    ]
    expect(preferredUnits(readings)).toEqual({ weight: 'lb', glucose: 'mg/dL' })
  })
})

describe('series and chart geometry', () => {
  it('lists points in time order, skipping readings without the value', () => {
    const points = series(
      [reading({ takenAt: 30, pulse: 70 }), reading({ takenAt: 10, pulse: 60 }), reading({ takenAt: 20 })],
      (r) => r.pulse,
    )
    expect(points).toEqual([
      { at: 10, value: 60 },
      { at: 30, value: 70 },
    ])
  })

  it('picks round ticks that cover the data', () => {
    expect(niceTicks(72, 138)).toEqual([60, 80, 100, 120, 140])
    expect(niceTicks(5.2, 6.9)).toEqual([5, 5.5, 6, 6.5, 7])
    const flat = niceTicks(70, 70)
    expect(flat[0]).toBeLessThan(70)
    expect(flat[flat.length - 1]).toBeGreaterThan(70)
    expect(niceTicks(Number.NaN, 1)).toEqual([])
  })

  it('maps the window to the frame', () => {
    const frame = { width: 100, height: 100, left: 0, right: 0, top: 0, bottom: 0 }
    const points = [
      { at: 0, value: 60 },
      { at: 50, value: 140 },
    ]
    const p = plot(points, 0, 100, frame)
    expect(p.x(0)).toBe(0)
    expect(p.x(100)).toBe(100)
    expect(p.y(60)).toBe(100)
    expect(p.y(140)).toBe(0)
    expect(linePath(points, p)).toBe('M0.0,100.0 L50.0,0.0')
  })

  it('formats with the given decimals', () => {
    expect(fmt(127.6)).toBe('128')
    expect(fmt(5.55, 1)).toBe('5.6')
    expect(fmt(80, 1)).toBe('80.0')
  })
})
