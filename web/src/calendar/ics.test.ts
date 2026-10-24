import { describe, expect, it } from 'vitest'
import { expandDoses } from '../meds/schedule'
import type { Medication } from '../meds/types'
import { timeAt } from '../meds/zoned'
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

  it('uses floating local times, with an explicit spring-gap parity limit', () => {
    const ics = buildICS({ ...base, startDate: '2026-03-07', schedule: { kind: 'daily', times: ['08:00'] } }, 'America/New_York', at)!
    expect(ics).toContain('DTSTART:20260307T080000')
    expect(ics).not.toContain('DTSTART;TZID=')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    const gapMed: Medication = { ...base, startDate: '2026-03-07', schedule: { kind: 'daily', times: ['02:30'] } }
    const gapICS = buildICS(gapMed, 'America/New_York', at)!
    const [gap] = expandDoses([gapMed], { from: '2026-03-08', to: '2026-03-08', timeZone: 'America/New_York' })
    expect(gapICS).toContain('DTSTART:20260307T023000')
    expect(gapICS).toContain('RRULE:FREQ=DAILY')
    expect(timeAt(gap.at, 'America/New_York')).toBe('03:30')
    // RFC recurrence consumers can omit this nonexistent 02:30 occurrence.
    // A generated RRULE cannot promise Carebook's 03:30 gap resolution.
    expect(() => buildICS(base, 'Mars/Olympus', at)).toThrow('Invalid time zone')
  })

  it('keeps one ambiguous fall-overlap event while Carebook picks the first occurrence', () => {
    const overlapMed: Medication = { ...base, startDate: '2026-10-31', schedule: { kind: 'daily', times: ['01:30'] } }
    const ics = buildICS(overlapMed, 'America/New_York', at)!
    const [overlap] = expandDoses([overlapMed], { from: '2026-11-01', to: '2026-11-01', timeZone: 'America/New_York' })
    expect(ics).toContain('DTSTART:20261031T013000')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(overlap.at).toBe(Date.parse('2026-11-01T05:30:00Z'))
  })

  it('includes an end-date dose, including 23:59, then ends recurrence', () => {
    const ending: Medication = { ...base, startDate: '2026-10-16', endDate: '2026-10-17', schedule: { kind: 'daily', times: ['23:59'] } }
    const ics = buildICS(ending, 'UTC', at)!
    expect(ics).toContain('DTSTART:20261016T235900')
    expect(ics).toContain('RRULE:FREQ=DAILY;UNTIL=20261017T235900')
    expect(expandDoses([ending], { from: '2026-10-16', to: '2026-10-18', timeZone: 'UTC' }).map((dose) => dose.date)).toEqual(['2026-10-16', '2026-10-17'])
  })

  it('begins weekly recurrence on the first eligible day and omits impossible windows', () => {
    const weekly: Medication = { ...base, startDate: '2026-10-17', schedule: { kind: 'weekly', days: [0, 1], times: ['09:00'] } }
    expect(buildICS(weekly, 'UTC', at)).toContain('DTSTART:20261018T090000')
    expect(buildICS({ ...weekly, endDate: '2026-10-17' }, 'UTC', at)).toBeNull()
    expect(expandDoses([weekly], { from: '2026-10-17', to: '2026-10-19', timeZone: 'UTC' }).map((dose) => dose.date)).toEqual(['2026-10-18', '2026-10-19'])
  })
})
