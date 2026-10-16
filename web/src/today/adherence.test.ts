import { describe, expect, it } from 'vitest'
import { type ScheduledDose, doseKey } from '../meds/schedule'
import type { Medication, Schedule } from '../meds/types'
import { adherenceByDay, adherencePercent, calcDayAdherence, calcPeriodAdherence } from './adherence'
import { type DoseLog, type DoseStatus, asNeededKey } from './types'

const DATE = '2026-10-16'
const at = (time: string) => Date.parse(`${DATE}T${time}:00Z`)

function dose(time: string, medicationId = 'm1', date = DATE): ScheduledDose {
  return { key: doseKey(medicationId, date, time), medicationId, date, time, at: Date.parse(`${date}T${time}:00Z`) }
}

function log(d: ScheduledDose, status: DoseStatus): DoseLog {
  return { key: d.key, medicationId: d.medicationId, date: d.date, time: d.time, status, loggedAt: d.at }
}

function prn(medicationId: string, time: string, status: DoseStatus = 'taken', date = DATE): DoseLog {
  const loggedAt = Date.parse(`${date}T${time}:00Z`)
  return { key: asNeededKey(medicationId, date, loggedAt), medicationId, date, time, status, asNeeded: true, loggedAt }
}

const three = [dose('08:00'), dose('14:00'), dose('20:00')]

describe('calcDayAdherence', () => {
  it('all taken is 100%', () => {
    const result = calcDayAdherence(three, three.map((d) => log(d, 'taken')))
    expect(result).toEqual({
      due: 3,
      taken: 3,
      skipped: 0,
      snoozed: 0,
      missed: 0,
      upcoming: 0,
      asNeededTaken: 0,
      percent: 100,
    })
  })

  it('all skipped is 0%', () => {
    const result = calcDayAdherence(three, three.map((d) => log(d, 'skipped')))
    expect(result).toMatchObject({ due: 3, taken: 0, skipped: 3, percent: 0 })
  })

  it('mixed: taken, skipped, snoozed and unlogged', () => {
    const logs = [log(three[0], 'taken'), log(three[1], 'skipped'), log(three[2], 'snoozed')]
    expect(calcDayAdherence(three, logs)).toMatchObject({ due: 3, taken: 1, skipped: 1, snoozed: 1, missed: 0, percent: 33 })

    const four = [...three, dose('22:00')]
    const result = calcDayAdherence(four, [log(three[0], 'taken'), log(three[1], 'taken')])
    expect(result).toMatchObject({ due: 4, taken: 2, missed: 2, percent: 50 })
  })

  it('zero scheduled has no percentage', () => {
    expect(calcDayAdherence([], [])).toEqual({
      due: 0,
      taken: 0,
      skipped: 0,
      snoozed: 0,
      missed: 0,
      upcoming: 0,
      asNeededTaken: 0,
      percent: null,
    })
  })

  it('an as-needed-only day has no percentage, but counts logged doses', () => {
    const result = calcDayAdherence([], [prn('p1', '09:10'), prn('p1', '15:40'), prn('p2', '11:00', 'skipped')])
    expect(result).toMatchObject({ due: 0, asNeededTaken: 2, percent: null })
  })

  it('as-needed doses never change the percentage of scheduled ones', () => {
    const logs = [log(three[0], 'taken'), prn('p1', '09:00'), prn('p1', '10:00')]
    expect(calcDayAdherence(three, logs)).toMatchObject({ due: 3, taken: 1, asNeededTaken: 2, percent: 33 })
  })

  it('leaves doses that are not yet due out until they are logged', () => {
    const now = at('12:00')
    // 08:00 taken; 14:00 and 20:00 still ahead.
    expect(calcDayAdherence(three, [log(three[0], 'taken')], now)).toMatchObject({
      due: 1,
      taken: 1,
      upcoming: 2,
      percent: 100,
    })
    // Logging a future dose early counts it.
    expect(calcDayAdherence(three, [log(three[0], 'taken'), log(three[2], 'taken')], now)).toMatchObject({
      due: 2,
      taken: 2,
      upcoming: 1,
    })
    // Before the first dose nothing is due yet.
    expect(calcDayAdherence(three, [], at('07:00'))).toMatchObject({ due: 0, upcoming: 3, percent: null })
    // A dose exactly at its time is due.
    expect(calcDayAdherence(three, [], at('08:00'))).toMatchObject({ due: 1, missed: 1, upcoming: 2, percent: 0 })
  })

  it('counts a snoozed dose as not taken, even before it is due', () => {
    expect(calcDayAdherence(three, [log(three[2], 'snoozed')], at('12:00'))).toMatchObject({
      due: 2,
      snoozed: 1,
      missed: 1,
      upcoming: 1,
      percent: 0,
    })
  })

  it('ignores logs for doses that are not on the schedule', () => {
    const stale = log(dose('09:00'), 'taken') // the schedule has since moved to other times
    const otherDay = log(dose('08:00', 'm1', '2026-10-15'), 'taken')
    expect(calcDayAdherence(three, [stale, otherDay])).toMatchObject({ due: 3, taken: 0, missed: 3, percent: 0 })
  })

  it('accepts statuses as a map', () => {
    const statuses = new Map(three.map((d) => [d.key, log(d, 'taken')]))
    expect(calcDayAdherence(three, statuses).percent).toBe(100)
  })
})

describe('adherencePercent', () => {
  it('rounds to whole numbers', () => {
    expect(adherencePercent(1, 3)).toBe(33)
    expect(adherencePercent(2, 3)).toBe(67)
    expect(adherencePercent(1, 8)).toBe(13)
  })

  it('never rounds up to 100% or down to 0% when that would be untrue', () => {
    expect(adherencePercent(199, 200)).toBe(99)
    expect(adherencePercent(1, 300)).toBe(1)
    expect(adherencePercent(200, 200)).toBe(100)
    expect(adherencePercent(0, 200)).toBe(0)
  })

  it('is null when nothing was due', () => {
    expect(adherencePercent(0, 0)).toBeNull()
  })
})

describe('calcPeriodAdherence', () => {
  it('weighs every dose equally, not every day', () => {
    const fullDay = calcDayAdherence(three, three.map((d) => log(d, 'taken'))) // 3/3
    const oneDose = [dose('08:00')]
    const missedDay = calcDayAdherence(oneDose, []) // 0/1
    const period = calcPeriodAdherence([fullDay, missedDay])
    // (3 + 0) / (3 + 1) = 75%, not the 50% mean of the two days.
    expect(period).toMatchObject({ due: 4, taken: 3, missed: 1, percent: 75, daysWithDoses: 2, daysAllTaken: 1 })
  })

  it('skips days with nothing due and sums as-needed doses separately', () => {
    const empty = calcDayAdherence([], [prn('p1', '10:00')])
    const day = calcDayAdherence(three, [log(three[0], 'taken'), log(three[1], 'skipped'), log(three[2], 'snoozed')])
    expect(calcPeriodAdherence([empty, day, empty])).toMatchObject({
      due: 3,
      taken: 1,
      skipped: 1,
      snoozed: 1,
      asNeededTaken: 2,
      percent: 33,
      daysWithDoses: 1,
      daysAllTaken: 0,
    })
  })

  it('has no percentage for an empty period', () => {
    expect(calcPeriodAdherence([])).toMatchObject({ due: 0, percent: null, daysWithDoses: 0, daysAllTaken: 0 })
  })
})

describe('adherenceByDay', () => {
  const med = (id: string, schedule: Schedule, extra: Partial<Medication> = {}): Medication => ({
    id,
    name: id,
    strength: '',
    form: 'tablet',
    schedule,
    startDate: '2026-10-01',
    notes: '',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  })

  it('computes each day of a range from the schedules and logs', () => {
    const meds = [
      med('a', { kind: 'daily', times: ['08:00', '20:00'] }),
      med('b', { kind: 'weekly', days: [5], times: ['09:00'] }, { startDate: '2026-10-15' }),
      med('p', { kind: 'as-needed' }),
    ]
    const logs: DoseLog[] = [
      log(dose('08:00', 'a', '2026-10-15'), 'taken'),
      log(dose('20:00', 'a', '2026-10-15'), 'taken'),
      log(dose('08:00', 'a', '2026-10-16'), 'taken'),
      log(dose('09:00', 'b', '2026-10-16'), 'skipped'),
      prn('p', '13:00', 'taken', '2026-10-16'),
    ]
    const days = adherenceByDay(meds, logs, { from: '2026-10-14', to: '2026-10-16', timeZone: 'UTC' }, at('12:00'))
    expect(days.map((d) => [d.date, d.taken, d.due, d.upcoming, d.asNeededTaken, d.percent])).toEqual([
      ['2026-10-14', 0, 2, 0, 0, 0],
      ['2026-10-15', 2, 2, 0, 0, 100],
      // Friday: a 08:00 taken, b 09:00 skipped, a 20:00 still to come.
      ['2026-10-16', 1, 2, 1, 1, 50],
    ])
    expect(calcPeriodAdherence(days)).toMatchObject({ due: 6, taken: 3, percent: 50, daysAllTaken: 1 })
  })

  it('gives empty days before a medication starts', () => {
    const days = adherenceByDay([med('a', { kind: 'daily', times: ['08:00'] })], [], {
      from: '2026-09-29',
      to: '2026-10-01',
      timeZone: 'UTC',
    })
    expect(days.map((d) => d.percent)).toEqual([null, null, 0])
  })
})
