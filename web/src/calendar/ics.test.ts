import { describe, expect, it } from 'vitest'
import type { Medication } from '../meds/types'
import { buildAllICS, buildICS, escapeICSText } from './ics'

const at = Date.parse('2026-10-16T14:00:00Z')
const base: Medication = {
  id: 'med-1',
  name: 'Example',
  strength: '10 mg',
  form: 'tablet',
  schedule: { kind: 'daily', times: ['08:00', '20:00'] },
  startDate: '2026-10-16',
  notes: '',
  createdAt: at,
  updatedAt: at,
}

describe('local calendar export', () => {
  it('makes one daily recurring event and alert for each time', () => {
    const ics = buildICS(base, 'America/New_York', at)!
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.match(/RRULE:FREQ=DAILY/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART:20261016T080000\r\n')
    expect(ics).toContain('DTSTART:20261016T200000\r\n')
    expect(ics).toContain('SUMMARY:Reminder')
    expect(ics).toContain('DESCRIPTION:Open Carebook to review your schedule')
    expect(ics).not.toContain('Example')
    expect(ics).not.toContain('10 mg')
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2)
    expect(ics).toContain('DTSTAMP:20261016T140000Z')
    expect(ics).toMatch(/END:VCALENDAR\r\n$/)
  })

  it('starts a weekly rule on the first matching day and stops after an end date', () => {
    const ics = buildICS({ ...base, schedule: { kind: 'weekly', days: [5, 1], times: ['09:30'] }, startDate: '2026-10-17', endDate: '2026-11-02' }, 'Australia/Melbourne', at)!
    expect(ics).toContain('DTSTART:20261019T093000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261102T235900')
  })

  it('omits as-needed medications and combines scheduled ones', () => {
    const prn = { ...base, id: 'prn', schedule: { kind: 'as-needed' } as const }
    expect(buildICS(prn, 'UTC', at)).toBeNull()
    const all = buildAllICS([base, prn, { ...base, id: 'med-2', schedule: { kind: 'daily', times: ['12:00'] } }], 'UTC', at)!
    expect(all.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(all).not.toContain('As needed')
  })

  it('escapes iCalendar text while keeping private names out of the file', () => {
    const name = `A, B; C\\D\n${'é'.repeat(45)}`
    const ics = buildICS({ ...base, name }, 'UTC', at)!
    expect(escapeICSText(name)).toBe(`A\\, B\\; C\\\\D\\n${'é'.repeat(45)}`)
    expect(ics).not.toContain(name)
    expect(ics).not.toContain('A\\, B')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(ics).not.toMatch(/(?<!\r)\n/)
  })

  it('keeps wall clock recurrence across DST and rejects invalid zones', () => {
    const ics = buildICS({ ...base, startDate: '2026-03-07', schedule: { kind: 'daily', times: ['08:00'] } }, 'America/New_York', at)!
    expect(ics).toContain('DTSTART:20260307T080000')
    expect(ics).not.toContain('DTSTART;TZID=')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(() => buildICS(base, 'Mars/Olympus', at)).toThrow('Invalid time zone')
  })
})
