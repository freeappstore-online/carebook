import type { Medication } from '../meds/types'
import { scheduleTimes } from '../meds/schedule'
import { addDays, isValidTimeZone, weekday } from '../meds/zoned'

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function escapeICSText(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\n').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// RFC 5545 content lines are limited to 75 octets, excluding CRLF. Fold on
// Unicode code point boundaries so names with non-ASCII characters survive.
function fold(line: string): string {
  const lines: string[] = ['']
  let width = 0
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length
    if (width + bytes > 75) {
      lines.push(' ')
      width = 1
    }
    lines[lines.length - 1] += char
    width += bytes
  }
  return lines.join('\r\n')
}

function localStamp(date: string, time: string): string {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`
}

function opaqueUid(id: string, time: string): string {
  // No medication identifier or user-entered text appears in calendar metadata.
  let a = 2166136261
  let b = 2166136261
  for (const char of `${id}|${time}`) {
    const code = char.codePointAt(0)!
    a = Math.imul(a ^ code, 16777619)
    b = Math.imul(b ^ (code + 0x9e37), 16777619)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}@carebook.freeappstore.online`
}

function firstDate(med: Medication): string {
  if (med.schedule.kind !== 'weekly') return med.startDate
  const startDay = weekday(med.startDate)
  const offset = Math.min(...med.schedule.days.map((day) => (day - startDay + 7) % 7))
  return addDays(med.startDate, offset)
}

function eventLines(med: Medication, at: number): string[] {
  const schedule = med.schedule
  if (schedule.kind === 'as-needed') return []
  const first = firstDate(med)
  if (med.endDate && first > med.endDate) return []
  const dtstamp = new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const rule = schedule.kind === 'daily' ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${[...schedule.days].sort((a, b) => a - b).map((day) => DAYS[day]).join(',')}`
  return scheduleTimes(schedule).flatMap((time) => [
    'BEGIN:VEVENT',
    `UID:${opaqueUid(med.id, time)}`,
    `DTSTAMP:${dtstamp}`,
    // Floating times match Carebook's schedule: the same wall time in the
    // calendar's current zone, including after travel or a DST change.
    `DTSTART:${localStamp(first, time)}`,
    'DURATION:PT5M',
    `RRULE:${rule}${med.endDate ? `;UNTIL=${localStamp(med.endDate, '23:59')}` : ''}`,
    'SUMMARY:Reminder',
    `DESCRIPTION:${escapeICSText('Open Carebook to review your schedule')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT0M',
    `DESCRIPTION:${escapeICSText('Open Carebook to review your schedule')}`,
    'END:VALARM',
    'END:VEVENT',
  ])
}

/** A local, recurring calendar export. As-needed medications have no events. */
export function buildICS(med: Medication, timeZone: string, at = Date.now()): string | null {
  return buildAllICS([med], timeZone, at)
}

/** Combines scheduled medications into one RFC 5545 calendar. */
export function buildAllICS(meds: readonly Medication[], timeZone: string, at = Date.now()): string | null {
  if (!isValidTimeZone(timeZone)) throw new RangeError('Invalid time zone')
  const events = meds.flatMap((med) => eventLines(med, at))
  if (events.length === 0) return null
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carebook//Calendar//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ]
  return `${lines.map(fold).join('\r\n')}\r\n`
}
