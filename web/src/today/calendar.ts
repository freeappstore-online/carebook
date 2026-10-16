import { type LocalDate, addDays, parseDate, weekday } from '../meds/zoned'

/** A calendar month, `YYYY-MM`. */
export type Month = string

export const monthOf = (date: LocalDate): Month => date.slice(0, 7)

export function firstOfMonth(month: Month): LocalDate {
  const date = `${month}-01`
  if (!parseDate(date)) throw new RangeError(`Invalid month: ${month}`)
  return date
}

export function addMonths(month: Month, delta: number): Month {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + delta
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function lastOfMonth(month: Month): LocalDate {
  return addDays(firstOfMonth(addMonths(month, 1)), -1)
}

/** Weeks (Sunday first) covering `month`; days outside it are null. */
export function monthGrid(month: Month): (LocalDate | null)[][] {
  const first = firstOfMonth(month)
  const last = lastOfMonth(month)
  const weeks: (LocalDate | null)[][] = []
  let week: (LocalDate | null)[] = Array.from({ length: weekday(first) }, () => null)
  for (let date = first; date <= last; date = addDays(date, 1)) {
    week.push(date)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)])
  return weeks
}

export function formatMonth(month: Month): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(y, m - 1, 1),
  )
}

export function formatDay(date: LocalDate): string {
  const p = parseDate(date)
  if (!p) return date
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(p.year, p.month - 1, p.day),
  )
}
