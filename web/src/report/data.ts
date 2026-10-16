// Gathers what goes in the clinician report for a date range. Pure: the
// screen loads the records, this shapes them, and pdf.ts draws the result.

import { MAX_RANGE_DAYS, describeSchedule } from '../meds/schedule'
import { FORM_LABELS, type Medication } from '../meds/types'
import { type LocalDate, dayNumber } from '../meds/zoned'
import { type PeriodAdherence, adherenceByDay, calcPeriodAdherence } from '../today/adherence'
import type { DoseLog } from '../today/types'
import { BP_CATEGORY_LABELS, bpCategory } from '../vitals/bp'
import { type VitalsAverages, averages, preferredUnits } from '../vitals/stats'
import { ARM_LABELS, POSITION_LABELS, type Reading } from '../vitals/types'

export const REPORT_TITLE = 'Carebook health log'
export const REPORT_SUBTITLE = 'Log and share with your clinician'
export const REPORT_DISCLAIMER =
  'This report lists what was entered in Carebook on this device. It is a log, not medical advice or a diagnosis.'

export interface ReportRange {
  from: LocalDate
  to: LocalDate
}

export interface MedicationRow {
  name: string
  strength: string
  form: string
  schedule: string
  dates: string
  notes: string
  /** Adherence for this medication over the range; null for as-needed or nothing due. */
  adherence: PeriodAdherence
  asNeeded: boolean
}

export interface BpRow {
  date: LocalDate
  time: string
  takenAt: number
  systolic: number
  diastolic: number
  pulse?: number
  arm: string
  position: string
  category: string
}

export interface OtherRow {
  date: LocalDate
  time: string
  pulse?: number
  weight?: string
  glucose?: string
}

export interface ReportData {
  range: ReportRange
  timeZone: string
  generatedAt: number
  medications: MedicationRow[]
  adherence: PeriodAdherence
  bp: BpRow[]
  /** Readings without blood pressure (pulse, weight or glucose only), plus weight/glucose taken with BP. */
  other: OtherRow[]
  averages: VitalsAverages
}

export interface ReportInput {
  range: ReportRange
  timeZone: string
  now: number
  medications: readonly Medication[]
  logs: readonly DoseLog[]
  readings: readonly Reading[]
}

export function checkRange(range: ReportRange): string | null {
  let from: number
  let to: number
  try {
    from = dayNumber(range.from)
    to = dayNumber(range.to)
  } catch {
    return 'Choose a start and end date'
  }
  if (to < from) return 'The end date is before the start date'
  if (to - from + 1 > MAX_RANGE_DAYS) return 'Choose a shorter date range'
  return null
}

function dates(m: Medication): string {
  return m.endDate ? `${m.startDate} to ${m.endDate}` : `From ${m.startDate}`
}

export function buildReportData(input: ReportInput): ReportData {
  const problem = checkRange(input.range)
  if (problem) throw new RangeError(problem)
  const { range, timeZone, now } = input
  const expand = { ...range, timeZone }
  const inRange = (d: LocalDate) => d >= range.from && d <= range.to
  const ids = new Set(input.medications.map((m) => m.id))
  const logs = input.logs.filter((l) => inRange(l.date) && ids.has(l.medicationId))

  // Medications that overlap the range.
  const meds = input.medications.filter((m) => m.startDate <= range.to && (!m.endDate || m.endDate >= range.from))
  const medications: MedicationRow[] = meds.map((m) => {
    const own = logs.filter((l) => l.medicationId === m.id)
    return {
      name: m.name,
      strength: m.strength,
      form: FORM_LABELS[m.form],
      schedule: describeSchedule(m.schedule),
      dates: dates(m),
      notes: m.notes,
      adherence: calcPeriodAdherence(adherenceByDay([m], own, expand, now)),
      asNeeded: m.schedule.kind === 'as-needed',
    }
  })

  const readings = input.readings.filter((r) => inRange(r.date)).sort((a, b) => a.takenAt - b.takenAt)
  const bp: BpRow[] = []
  const other: OtherRow[] = []
  for (const r of readings) {
    if (r.systolic !== undefined && r.diastolic !== undefined) {
      const category = bpCategory(r.systolic, r.diastolic)
      bp.push({
        date: r.date,
        time: r.time,
        takenAt: r.takenAt,
        systolic: r.systolic,
        diastolic: r.diastolic,
        ...(r.pulse !== undefined ? { pulse: r.pulse } : {}),
        arm: r.arm ? ARM_LABELS[r.arm] : '',
        position: r.position ? POSITION_LABELS[r.position] : '',
        category: category ? BP_CATEGORY_LABELS[category] : '',
      })
    }
    const bpPulse = r.systolic !== undefined
    if ((!bpPulse && r.pulse !== undefined) || r.weight || r.glucose) {
      other.push({
        date: r.date,
        time: r.time,
        ...(!bpPulse && r.pulse !== undefined ? { pulse: r.pulse } : {}),
        ...(r.weight ? { weight: `${r.weight.value} ${r.weight.unit}` } : {}),
        ...(r.glucose ? { glucose: `${r.glucose.value} ${r.glucose.unit}` } : {}),
      })
    }
  }

  return {
    range,
    timeZone,
    generatedAt: now,
    medications,
    adherence: calcPeriodAdherence(adherenceByDay(meds, logs, expand, now)),
    bp,
    other,
    averages: averages(readings, preferredUnits(readings)),
  }
}

export const reportFileName = (range: ReportRange) => `carebook-log-${range.from}-to-${range.to}.pdf`
