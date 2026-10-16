// Expands medication schedules into dated doses for a range of calendar days.
// Days are walked as calendar dates (never by adding 24 h), and each wall-clock
// time is turned into an instant in the given time zone, so DST changes neither
// drop nor duplicate a dose.

import type { Medication, Schedule } from './types'
import { type LocalDate, type LocalTime, addDays, dateAt, dayNumber, weekday, zonedToEpoch } from './zoned'

export interface ScheduledDose {
  /** Stable id for logging this dose: medication, calendar date and wall time. */
  key: string
  medicationId: string
  date: LocalDate
  time: LocalTime
  /** The instant the dose falls due in the zone it was expanded for. */
  at: number
}

export interface ExpandRange {
  /** First calendar day, inclusive. */
  from: LocalDate
  /** Last calendar day, inclusive. */
  to: LocalDate
  timeZone: string
}

/** Longest range expanded in one call (about ten years). */
export const MAX_RANGE_DAYS = 3660

export const doseKey = (medicationId: string, date: LocalDate, time: LocalTime) => `${medicationId}|${date}|${time}`

/** Whether the schedule has doses on `date`, ignoring start and end dates. */
export function scheduledOn(schedule: Schedule, date: LocalDate): boolean {
  switch (schedule.kind) {
    case 'daily':
      return true
    case 'weekly':
      return schedule.days.includes(weekday(date))
    case 'as-needed':
      return false
  }
}

export function scheduleTimes(schedule: Schedule): LocalTime[] {
  return schedule.kind === 'as-needed' ? [] : [...schedule.times].sort()
}

/** Every scheduled dose of `meds` on the days in `range`, in time order. */
export function expandDoses(meds: readonly Medication[], range: ExpandRange): ScheduledDose[] {
  const first = dayNumber(range.from)
  const last = dayNumber(range.to)
  if (last < first) return []
  if (last - first + 1 > MAX_RANGE_DAYS) throw new RangeError('Date range is too long')

  const doses: ScheduledDose[] = []
  for (const med of meds) {
    const times = scheduleTimes(med.schedule)
    if (times.length === 0) continue
    const start = Math.max(first, dayNumber(med.startDate))
    const end = med.endDate ? Math.min(last, dayNumber(med.endDate)) : last
    for (let day = start; day <= end; day++) {
      const date = addDays(range.from, day - first)
      if (!scheduledOn(med.schedule, date)) continue
      for (const time of times) {
        doses.push({
          key: doseKey(med.id, date, time),
          medicationId: med.id,
          date,
          time,
          at: zonedToEpoch(date, time, range.timeZone),
        })
      }
    }
  }
  return doses.sort((a, b) => a.at - b.at || a.time.localeCompare(b.time) || a.medicationId.localeCompare(b.medicationId))
}

/** The first scheduled dose of `med` due at or after `now`, looking up to two weeks ahead. */
export function nextDose(med: Medication, now: number, timeZone: string): ScheduledDose | undefined {
  const today = dateAt(now, timeZone)
  return expandDoses([med], { from: today, to: addDays(today, 14), timeZone }).find((d) => d.at >= now)
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** A short plain-language summary, e.g. "Every day at 08:00 and 20:00". */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'as-needed':
      return 'As needed'
    case 'daily':
      return `Every day at ${joinList(scheduleTimes(schedule))}`
    case 'weekly': {
      const days = [...schedule.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d])
      return `${joinList(days)} at ${joinList(scheduleTimes(schedule))}`
    }
  }
}

export const WEEKDAYS = WEEKDAY_SHORT
