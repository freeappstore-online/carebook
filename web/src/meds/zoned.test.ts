import { describe, expect, it } from 'vitest'
import {
  addDays,
  dateAt,
  isValidDate,
  isValidTime,
  isValidTimeZone,
  offsetAt,
  timeAt,
  weekday,
  zonedToEpoch,
} from './zoned'

const utc = (iso: string) => Date.parse(iso)
const H = 3_600_000

describe('calendar dates', () => {
  it('validates dates and times strictly', () => {
    expect(isValidDate('2026-02-28')).toBe(true)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2026-2-1')).toBe(false)
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('8:00')).toBe(false)
  })

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('knows the weekday of a date', () => {
    expect(weekday('2026-10-16')).toBe(5) // Friday
    expect(weekday('2026-03-08')).toBe(0) // Sunday
    expect(weekday('1970-01-01')).toBe(4) // Thursday
    expect(weekday('1969-12-28')).toBe(0)
  })

  it('recognises IANA zones', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
  })
})

describe('zonedToEpoch', () => {
  it('handles ordinary days, fractional offsets and far-east zones', () => {
    expect(zonedToEpoch('2026-06-01', '08:00', 'UTC')).toBe(utc('2026-06-01T08:00:00Z'))
    expect(zonedToEpoch('2026-06-01', '08:00', 'America/New_York')).toBe(utc('2026-06-01T12:00:00Z'))
    expect(zonedToEpoch('2026-06-01', '08:00', 'Asia/Kolkata')).toBe(utc('2026-06-01T02:30:00Z'))
    expect(zonedToEpoch('2026-06-01', '08:00', 'Asia/Kathmandu')).toBe(utc('2026-06-01T02:15:00Z'))
    expect(zonedToEpoch('2026-06-01', '08:00', 'Pacific/Kiritimati')).toBe(utc('2026-05-31T18:00:00Z'))
    expect(zonedToEpoch('2026-06-01', '00:00', 'Pacific/Pago_Pago')).toBe(utc('2026-06-01T11:00:00Z'))
  })

  it('moves a time in a spring-forward gap forward by the gap', () => {
    // New York, 8 March 2026: 02:00 EST → 03:00 EDT.
    const ny = zonedToEpoch('2026-03-08', '02:30', 'America/New_York')
    expect(ny).toBe(utc('2026-03-08T07:30:00Z'))
    expect(timeAt(ny, 'America/New_York')).toBe('03:30')
    // London, 29 March 2026: 01:00 GMT → 02:00 BST.
    expect(zonedToEpoch('2026-03-29', '01:30', 'Europe/London')).toBe(utc('2026-03-29T01:30:00Z'))
    // Sydney, 4 October 2026: 02:00 AEST → 03:00 AEDT.
    expect(zonedToEpoch('2026-10-04', '02:30', 'Australia/Sydney')).toBe(utc('2026-10-03T16:30:00Z'))
    // Lord Howe Island shifts by 30 minutes: 02:00 → 02:30.
    const lh = zonedToEpoch('2026-10-04', '02:15', 'Australia/Lord_Howe')
    expect(lh).toBe(utc('2026-10-03T15:45:00Z'))
    expect(timeAt(lh, 'Australia/Lord_Howe')).toBe('02:45')
  })

  it('resolves a repeated fall-back time to its first occurrence', () => {
    // New York, 1 November 2026: 01:00–02:00 happens twice (EDT then EST).
    expect(zonedToEpoch('2026-11-01', '01:30', 'America/New_York')).toBe(utc('2026-11-01T05:30:00Z'))
    // London, 25 October 2026: 01:00–02:00 happens twice (BST then GMT).
    expect(zonedToEpoch('2026-10-25', '01:30', 'Europe/London')).toBe(utc('2026-10-25T00:30:00Z'))
    // Sydney, 5 April 2026: 02:00–03:00 happens twice (AEDT then AEST).
    expect(zonedToEpoch('2026-04-05', '02:30', 'Australia/Sydney')).toBe(utc('2026-04-04T15:30:00Z'))
  })

  it('is exact on either side of a transition', () => {
    expect(zonedToEpoch('2026-03-08', '01:59', 'America/New_York')).toBe(utc('2026-03-08T06:59:00Z'))
    expect(zonedToEpoch('2026-03-08', '03:00', 'America/New_York')).toBe(utc('2026-03-08T07:00:00Z'))
    expect(zonedToEpoch('2026-11-01', '00:59', 'America/New_York')).toBe(utc('2026-11-01T04:59:00Z'))
    expect(zonedToEpoch('2026-11-01', '02:00', 'America/New_York')).toBe(utc('2026-11-01T07:00:00Z'))
  })

  it('round-trips every hour of a year in DST zones', () => {
    for (const zone of ['America/New_York', 'Europe/Berlin', 'Australia/Sydney', 'America/Santiago']) {
      let date = '2026-01-01'
      for (let i = 0; i < 365; i++, date = addDays(date, 1)) {
        for (let h = 0; h < 24; h++) {
          const time = `${String(h).padStart(2, '0')}:15`
          const at = zonedToEpoch(date, time, zone)
          const gap = timeAt(at, zone) !== time
          if (gap) {
            // Only a skipped hour may move, and only forward by the offset change.
            expect(offsetAt(at, zone) - offsetAt(at - 2 * H, zone)).toBeGreaterThan(0)
          } else {
            expect(dateAt(at, zone)).toBe(date)
          }
        }
      }
    }
  })
})
