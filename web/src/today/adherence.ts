// Adherence maths: pure functions over scheduled doses and what was logged.
//
// - A scheduled dose counts once it is due: logged (taken, skipped or snoozed)
//   or with its time passed. A dose still ahead and not yet logged is "upcoming"
//   and left out, so the morning of a day isn't marked down for the evening.
// - Adherence % = taken ÷ due. Skipped, snoozed-and-not-taken and missed
//   doses are all "not taken".
// - As-needed medications have no schedule, so their doses never enter the
//   percentage; logged ones are counted separately.

import { type ExpandRange, type ScheduledDose, expandDoses } from '../meds/schedule'
import type { Medication } from '../meds/types'
import { type LocalDate, addDays, dayNumber } from '../meds/zoned'
import type { DoseLog, DoseStatus } from './types'

export interface AdherenceCounts {
  /** Scheduled doses that count: logged, or past their time. */
  due: number
  taken: number
  skipped: number
  snoozed: number
  /** Past their time with nothing logged. */
  missed: number
  /** Not yet due and not logged; not part of `due`. */
  upcoming: number
  /** As-needed doses logged as taken; never part of `due`. */
  asNeededTaken: number
}

export interface Adherence extends AdherenceCounts {
  /** Whole-number % of due doses taken, or null when nothing was due. */
  percent: number | null
}

export interface DayAdherence extends Adherence {
  date: LocalDate
}

export interface PeriodAdherence extends Adherence {
  /** Days with at least one due dose. */
  daysWithDoses: number
  /** Days where every due dose was taken. */
  daysAllTaken: number
}

const emptyCounts = (): AdherenceCounts => ({
  due: 0,
  taken: 0,
  skipped: 0,
  snoozed: 0,
  missed: 0,
  upcoming: 0,
  asNeededTaken: 0,
})

/**
 * Rounds taken ÷ due to a whole %, never showing 100% unless every dose was
 * taken, nor 0% if any was.
 */
export function adherencePercent(taken: number, due: number): number | null {
  if (due <= 0) return null
  const rounded = Math.round((taken / due) * 100)
  if (rounded === 100 && taken < due) return 99
  if (rounded === 0 && taken > 0) return 1
  return rounded
}

type Statuses = ReadonlyMap<string, DoseLog> | readonly DoseLog[]

const toMap = (statuses: Statuses): ReadonlyMap<string, DoseLog> =>
  Array.isArray(statuses) ? new Map(statuses.map((l) => [l.key, l])) : (statuses as ReadonlyMap<string, DoseLog>)

/**
 * Adherence for one day's scheduled doses. `statuses` may hold logs for other
 * keys (other days, or doses no longer on the schedule); those are ignored,
 * except as-needed logs, which are counted in `asNeededTaken`.
 */
export function calcDayAdherence(
  scheduled: readonly ScheduledDose[],
  statuses: Statuses,
  now: number = Number.POSITIVE_INFINITY,
): Adherence {
  const logs = toMap(statuses)
  const counts = emptyCounts()
  for (const dose of scheduled) {
    const status: DoseStatus | undefined = logs.get(dose.key)?.status
    if (status === undefined) {
      if (dose.at > now) counts.upcoming++
      else {
        counts.due++
        counts.missed++
      }
      continue
    }
    counts.due++
    counts[status]++
  }
  for (const log of logs.values()) {
    if (log.asNeeded && log.status === 'taken') counts.asNeededTaken++
  }
  return { ...counts, percent: adherencePercent(counts.taken, counts.due) }
}

/** Totals over several days. The % weighs every dose equally, not every day. */
export function calcPeriodAdherence(days: readonly Adherence[]): PeriodAdherence {
  const totals = emptyCounts()
  let daysWithDoses = 0
  let daysAllTaken = 0
  for (const day of days) {
    for (const k of Object.keys(totals) as (keyof AdherenceCounts)[]) totals[k] += day[k]
    if (day.due > 0) {
      daysWithDoses++
      if (day.taken === day.due) daysAllTaken++
    }
  }
  return { ...totals, percent: adherencePercent(totals.taken, totals.due), daysWithDoses, daysAllTaken }
}

/** Per-day adherence for every day in `range`, oldest first. */
export function adherenceByDay(
  meds: readonly Medication[],
  logs: readonly DoseLog[],
  range: ExpandRange,
  now: number = Number.POSITIVE_INFINITY,
): DayAdherence[] {
  const dosesByDate = new Map<LocalDate, ScheduledDose[]>()
  for (const dose of expandDoses(meds, range)) {
    const list = dosesByDate.get(dose.date)
    if (list) list.push(dose)
    else dosesByDate.set(dose.date, [dose])
  }
  const logsByDate = new Map<LocalDate, DoseLog[]>()
  for (const log of logs) {
    const list = logsByDate.get(log.date)
    if (list) list.push(log)
    else logsByDate.set(log.date, [log])
  }
  const out: DayAdherence[] = []
  const days = dayNumber(range.to) - dayNumber(range.from) + 1
  for (let i = 0; i < days; i++) {
    const date = addDays(range.from, i)
    out.push({ date, ...calcDayAdherence(dosesByDate.get(date) ?? [], logsByDate.get(date) ?? [], now) })
  }
  return out
}
