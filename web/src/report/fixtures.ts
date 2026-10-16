// Mock records for report tests.

import { doseKey } from '../meds/schedule'
import type { Medication } from '../meds/types'
import { zonedToEpoch } from '../meds/zoned'
import type { DoseLog, DoseStatus } from '../today/types'
import type { Reading } from '../vitals/types'
import type { ReportInput } from './data'

export const TZ = 'Europe/London'
// 12:00 on 16 October 2026 in London (BST, UTC+1).
export const NOW = Date.parse('2026-10-16T11:00:00Z')

const med = (m: Partial<Medication> & Pick<Medication, 'id' | 'name' | 'schedule'>): Medication => ({
  strength: '',
  form: 'tablet',
  startDate: '2026-10-01',
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  ...m,
})

export const MEDS: Medication[] = [
  med({
    id: 'alpha',
    name: 'Medication Alpha',
    strength: '10 mg',
    schedule: { kind: 'daily', times: ['08:00', '20:00'] },
    startDate: '2026-10-13',
    notes: 'With breakfast and dinner',
  }),
  med({ id: 'beta', name: 'Medication Beta', form: 'inhaler', schedule: { kind: 'as-needed' } }),
  med({ id: 'old', name: 'Stopped Gamma', schedule: { kind: 'daily', times: ['09:00'] }, startDate: '2026-01-01', endDate: '2026-02-01' }),
]

const log = (medicationId: string, date: string, time: string, status: DoseStatus): DoseLog => ({
  key: doseKey(medicationId, date, time),
  medicationId,
  date,
  time,
  status,
  loggedAt: zonedToEpoch(date, time, TZ),
})

// Alpha, 13–16 Oct: 7 doses due by noon on the 16th (20:00 that day is still ahead).
export const LOGS: DoseLog[] = [
  log('alpha', '2026-10-13', '08:00', 'taken'),
  log('alpha', '2026-10-13', '20:00', 'taken'),
  log('alpha', '2026-10-14', '08:00', 'taken'),
  log('alpha', '2026-10-14', '20:00', 'skipped'),
  log('alpha', '2026-10-15', '08:00', 'taken'),
  log('alpha', '2026-10-15', '20:00', 'snoozed'),
  // 16 Oct 08:00 not logged.
  {
    key: 'beta|2026-10-15|prn-1',
    medicationId: 'beta',
    date: '2026-10-15',
    time: '14:10',
    status: 'taken',
    asNeeded: true,
    loggedAt: zonedToEpoch('2026-10-15', '14:10', TZ),
  },
]

let n = 0
const reading = (date: string, time: string, r: Partial<Reading>): Reading => ({
  id: `r${++n}`,
  date,
  time,
  takenAt: zonedToEpoch(date, time, TZ),
  notes: '',
  createdAt: 0,
  updatedAt: 0,
  ...r,
})

export const READINGS: Reading[] = [
  reading('2026-10-14', '07:30', { systolic: 118, diastolic: 76, pulse: 62, arm: 'left', position: 'sitting' }),
  reading('2026-10-15', '07:45', { systolic: 134, diastolic: 86, pulse: 70, arm: 'left', position: 'sitting' }),
  reading('2026-10-16', '07:40', { systolic: 142, diastolic: 91, weight: { value: 72.4, unit: 'kg' } }),
  reading('2026-10-15', '21:00', { glucose: { value: 5.8, unit: 'mmol/L' } }),
  reading('2026-09-01', '08:00', { systolic: 200, diastolic: 130 }), // outside the range
]

export const INPUT: ReportInput = {
  range: { from: '2026-10-10', to: '2026-10-16' },
  timeZone: TZ,
  now: NOW,
  medications: MEDS,
  logs: LOGS,
  readings: READINGS,
}
