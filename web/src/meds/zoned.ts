// Wall-clock maths in an IANA time zone, using only Intl. Nothing here reads the
// process's own time zone (no local Date getters), so results depend only on
// the `timeZone` argument.

/** A calendar date, `YYYY-MM-DD`. */
export type LocalDate = string
/** A wall-clock time, `HH:MM` (24-hour). */
export type LocalTime = string

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DAY_MS = 86_400_000

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** True if `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** The device's time zone, falling back to UTC. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface WallParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function wallParts(epochMs: number, timeZone: string): WallParts {
  const out: Record<string, number> = {}
  for (const p of formatter(timeZone).formatToParts(epochMs)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second,
  }
}

/** The zone's UTC offset at an instant, in ms (positive east of Greenwich). */
export function offsetAt(epochMs: number, timeZone: string): number {
  const whole = Math.floor(epochMs / 1000) * 1000
  const w = wallParts(whole, timeZone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - whole
}

export function parseDate(date: LocalDate): { year: number; month: number; day: number } | null {
  const m = DATE_RE.exec(date)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { year, month, day }
}

export function isValidDate(date: string): boolean {
  return parseDate(date) !== null
}

export function parseTime(time: LocalTime): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(time)
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null
}

export function isValidTime(time: string): boolean {
  return parseTime(time) !== null
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

function fromDayNumber(dayNumber: number): LocalDate {
  const d = new Date(dayNumber * DAY_MS)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Days since 1970-01-01 for a calendar date (no time zone involved). */
export function dayNumber(date: LocalDate): number {
  const p = parseDate(date)
  if (!p) throw new RangeError(`Invalid date: ${date}`)
  return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(dayNumber(date) + days)
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export function weekday(date: LocalDate): number {
  return (((dayNumber(date) + 4) % 7) + 7) % 7
}

/** The calendar date at an instant in `timeZone`. */
export function dateAt(epochMs: number, timeZone: string): LocalDate {
  const w = wallParts(epochMs, timeZone)
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`
}

/** The wall-clock time (`HH:MM`) at an instant in `timeZone`. */
export function timeAt(epochMs: number, timeZone: string): LocalTime {
  const w = wallParts(epochMs, timeZone)
  return `${pad(w.hour)}:${pad(w.minute)}`
}

/**
 * The instant a wall-clock date and time happens in `timeZone`.
 *
 * DST edges follow the "compatible" rule (as in Temporal and RFC 5545):
 * - a time skipped by a spring-forward gap moves forward by the gap
 *   (02:30 on a 02:00→03:00 night is 03:30);
 * - a time repeated by a fall-back overlap resolves to its first occurrence.
 */
export function zonedToEpoch(date: LocalDate, time: LocalTime, timeZone: string): number {
  const d = parseDate(date)
  const t = parseTime(time)
  if (!d) throw new RangeError(`Invalid date: ${date}`)
  if (!t) throw new RangeError(`Invalid time: ${time}`)
  const asUtc = Date.UTC(d.year, d.month - 1, d.day, t.hour, t.minute)
  // Offsets either side of any transition near this wall time. Zones change
  // offset at most once a day, so a day either side brackets it.
  const before = offsetAt(asUtc - DAY_MS, timeZone)
  const after = offsetAt(asUtc + DAY_MS, timeZone)
  const candidates = [...new Set([asUtc - before, asUtc - after])]
    .filter((epoch) => asUtc - offsetAt(epoch, timeZone) === epoch)
    .sort((a, b) => a - b)
  if (candidates.length > 0) return candidates[0]
  // In a gap: read the wall time with the offset in force before it.
  return asUtc - before
}
