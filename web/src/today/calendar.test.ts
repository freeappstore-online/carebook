import { describe, expect, it } from 'vitest'
import { addMonths, firstOfMonth, lastOfMonth, monthGrid, monthOf } from './calendar'

describe('month helpers', () => {
  it('steps months across years', () => {
    expect(monthOf('2026-10-16')).toBe('2026-10')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -22)).toBe('2024-12')
  })

  it('knows the first and last day, including leap years', () => {
    expect(firstOfMonth('2026-10')).toBe('2026-10-01')
    expect(lastOfMonth('2026-02')).toBe('2026-02-28')
    expect(lastOfMonth('2028-02')).toBe('2028-02-29')
    expect(lastOfMonth('2026-12')).toBe('2026-12-31')
  })

  it('lays out weeks starting on Sunday', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const grid = monthGrid('2026-10')
    expect(grid).toHaveLength(5)
    expect(grid[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(grid[4]).toEqual(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(grid.flat().filter(Boolean)).toHaveLength(31)
    // February 2026 starts on a Sunday: exactly four weeks.
    expect(monthGrid('2026-02')).toHaveLength(4)
    // August 2026 starts on a Saturday: six rows.
    expect(monthGrid('2026-08')).toHaveLength(6)
  })
})
