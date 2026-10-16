import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_RANGE_DAYS, describeSchedule, expandDoses, nextDose, scheduledOn } from './schedule'
import type { Medication, Schedule } from './types'
import { addDays, timeAt } from './zoned'

const utc = (iso: string) => Date.parse(iso)
const H = 3_600_000

function med(schedule: Schedule, extra: Partial<Medication> = {}): Medication {
  return {
    id: 'm1',
    name: 'Example',
    strength: '10 mg',
    form: 'tablet',
    schedule,
    startDate: '2026-01-01',
    notes: '',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  }
}

const daily = (...times: string[]): Schedule => ({ kind: 'daily', times })

describe('expandDoses', () => {
  it('lists each scheduled time on each day, in time order', () => {
    const doses = expandDoses([med(daily('20:00', '08:00'))], {
      from: '2026-06-01',
      to: '2026-06-02',
      timeZone: 'UTC',
    })
    expect(doses.map((d) => d.key)).toEqual([
      'm1|2026-06-01|08:00',
      'm1|2026-06-01|20:00',
      'm1|2026-06-02|08:00',
      'm1|2026-06-02|20:00',
    ])
    expect(doses[0]).toEqual({
      key: 'm1|2026-06-01|08:00',
      medicationId: 'm1',
      date: '2026-06-01',
      time: '08:00',
      at: utc('2026-06-01T08:00:00Z'),
    })
  })

  it('keeps one dose per wall time across spring forward (a 23-hour day)', () => {
    const doses = expandDoses([med(daily('08:00'))], {
      from: '2026-03-07',
      to: '2026-03-09',
      timeZone: 'America/New_York',
    })
    expect(doses.map((d) => d.at)).toEqual([
      utc('2026-03-07T13:00:00Z'),
      utc('2026-03-08T12:00:00Z'),
      utc('2026-03-09T12:00:00Z'),
    ])
    expect(doses.every((d) => timeAt(d.at, 'America/New_York') === '08:00')).toBe(true)
    expect(doses[1].at - doses[0].at).toBe(23 * H)
  })

  it('keeps one dose per wall time across fall back (a 25-hour day)', () => {
    const doses = expandDoses([med(daily('08:00', '01:30'))], {
      from: '2026-10-31',
      to: '2026-11-02',
      timeZone: 'America/New_York',
    })
    // 01:30 on 1 November happens twice on the clock but is one dose.
    expect(doses.filter((d) => d.date === '2026-11-01').map((d) => d.at)).toEqual([
      utc('2026-11-01T05:30:00Z'),
      utc('2026-11-01T13:00:00Z'),
    ])
    expect(doses).toHaveLength(6)
    const eights = doses.filter((d) => d.time === '08:00')
    expect(eights[1].at - eights[0].at).toBe(25 * H)
  })

  it('moves a dose in the skipped hour to just after it, without dropping it', () => {
    const doses = expandDoses([med(daily('02:30'))], {
      from: '2026-03-08',
      to: '2026-03-08',
      timeZone: 'America/New_York',
    })
    expect(doses).toHaveLength(1)
    expect(doses[0].key).toBe('m1|2026-03-08|02:30')
    expect(timeAt(doses[0].at, 'America/New_York')).toBe('03:30')
  })

  it('has the same doses in every zone, at that zone’s wall times', () => {
    const meds = [med(daily('08:00', '21:00'))]
    const range = { from: '2026-03-01', to: '2026-04-30' }
    const zones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Lord_Howe', 'Pacific/Kiritimati']
    const keys = expandDoses(meds, { ...range, timeZone: 'UTC' }).map((d) => d.key)
    expect(keys).toHaveLength(61 * 2)
    for (const timeZone of zones) {
      const doses = expandDoses(meds, { ...range, timeZone })
      expect(doses.map((d) => d.key)).toEqual(keys)
      for (const d of doses) expect(timeAt(d.at, timeZone)).toBe(d.time)
    }
  })

  describe('does not depend on the process time zone', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('gives identical output under different TZ settings', () => {
      const meds = [med(daily('02:30', '08:00'))]
      const range = { from: '2026-03-01', to: '2026-03-31', timeZone: 'America/New_York' }
      vi.stubEnv('TZ', 'UTC')
      const reference = expandDoses(meds, range)
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/London', 'Asia/Kathmandu']) {
        vi.stubEnv('TZ', tz)
        expect(expandDoses(meds, range)).toEqual(reference)
      }
    })
  })

  it('expands weekly schedules on the chosen weekdays only', () => {
    const doses = expandDoses([med({ kind: 'weekly', days: [1, 3, 5], times: ['09:00'] })], {
      from: '2026-10-11', // Sunday
      to: '2026-10-17', // Saturday
      timeZone: 'Europe/Paris',
    })
    expect(doses.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-14', '2026-10-16'])
  })

  it('keeps weekly doses on their weekday across a DST change', () => {
    // Europe/Paris falls back on Sunday 25 October 2026.
    const doses = expandDoses([med({ kind: 'weekly', days: [0], times: ['09:00'] })], {
      from: '2026-10-01',
      to: '2026-11-30',
      timeZone: 'Europe/Paris',
    })
    expect(doses.map((d) => d.date)).toEqual([
      '2026-10-04',
      '2026-10-11',
      '2026-10-18',
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29',
    ])
    expect(doses.every((d) => timeAt(d.at, 'Europe/Paris') === '09:00')).toBe(true)
  })

  it('never schedules as-needed medications', () => {
    expect(
      expandDoses([med({ kind: 'as-needed' })], { from: '2026-01-01', to: '2026-12-31', timeZone: 'UTC' }),
    ).toEqual([])
  })

  it('respects start and end dates (end inclusive)', () => {
    const doses = expandDoses([med(daily('08:00'), { startDate: '2026-05-03', endDate: '2026-05-05' })], {
      from: '2026-05-01',
      to: '2026-05-31',
      timeZone: 'UTC',
    })
    expect(doses.map((d) => d.date)).toEqual(['2026-05-03', '2026-05-04', '2026-05-05'])
  })

  it('merges several medications in time order', () => {
    const a = med(daily('20:00'), { id: 'a' })
    const b = med(daily('08:00'), { id: 'b' })
    const doses = expandDoses([a, b], { from: '2026-05-01', to: '2026-05-01', timeZone: 'UTC' })
    expect(doses.map((d) => d.medicationId)).toEqual(['b', 'a'])
  })

  it('returns nothing for a reversed range and refuses huge ranges', () => {
    expect(expandDoses([med(daily('08:00'))], { from: '2026-05-02', to: '2026-05-01', timeZone: 'UTC' })).toEqual([])
    expect(() =>
      expandDoses([med(daily('08:00'))], {
        from: '2026-01-01',
        to: addDays('2026-01-01', MAX_RANGE_DAYS),
        timeZone: 'UTC',
      }),
    ).toThrow(/too long/)
  })
})

describe('nextDose', () => {
  it('finds the next dose later today, or on a later day', () => {
    const m = med(daily('08:00', '20:00'))
    const tz = 'America/New_York'
    expect(nextDose(m, utc('2026-03-08T14:00:00Z'), tz)?.key).toBe('m1|2026-03-08|20:00')
    expect(nextDose(m, utc('2026-03-09T01:00:00Z'), tz)?.key).toBe('m1|2026-03-09|08:00')
    expect(nextDose(med({ kind: 'as-needed' }), 0, tz)).toBeUndefined()
  })

  it('uses the calendar day in the given zone', () => {
    // 23:30 UTC on 1 June is already 2 June in Tokyo.
    const next = nextDose(med(daily('08:00')), utc('2026-06-01T23:30:00Z'), 'Asia/Tokyo')
    expect(next?.date).toBe('2026-06-03')
  })
})

describe('schedule summaries', () => {
  it('describes each kind', () => {
    expect(describeSchedule({ kind: 'as-needed' })).toBe('As needed')
    expect(describeSchedule(daily('20:00', '08:00'))).toBe('Every day at 08:00 and 20:00')
    expect(describeSchedule({ kind: 'weekly', days: [5, 1, 3], times: ['09:00'] })).toBe('Mon, Wed and Fri at 09:00')
  })

  it('knows which days are scheduled', () => {
    expect(scheduledOn(daily('08:00'), '2026-10-16')).toBe(true)
    expect(scheduledOn({ kind: 'weekly', days: [5], times: ['08:00'] }, '2026-10-16')).toBe(true)
    expect(scheduledOn({ kind: 'weekly', days: [4], times: ['08:00'] }, '2026-10-16')).toBe(false)
    expect(scheduledOn({ kind: 'as-needed' }, '2026-10-16')).toBe(false)
  })
})
