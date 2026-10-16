import type { LocalDate, LocalTime } from './zoned'

export const FORMS = [
  'tablet',
  'capsule',
  'liquid',
  'drops',
  'inhaler',
  'injection',
  'patch',
  'cream',
  'spray',
  'other',
] as const
export type MedicationForm = (typeof FORMS)[number]

export const FORM_LABELS: Record<MedicationForm, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  liquid: 'Liquid',
  drops: 'Drops',
  inhaler: 'Inhaler',
  injection: 'Injection',
  patch: 'Patch',
  cream: 'Cream or ointment',
  spray: 'Spray',
  other: 'Other',
}

/**
 * When a medication is logged. Times are wall-clock times in whatever time
 * zone the device is in on that day, so "08:00" stays 08:00 after travel or a
 * clock change.
 * - `daily`: every day at `times`.
 * - `weekly`: on `days` (0 = Sunday … 6 = Saturday) at `times`.
 * - `as-needed`: no scheduled times; doses are logged when they happen.
 */
export type Schedule =
  | { kind: 'daily'; times: LocalTime[] }
  | { kind: 'weekly'; days: number[]; times: LocalTime[] }
  | { kind: 'as-needed' }

export type ScheduleKind = Schedule['kind']

export interface Medication {
  id: string
  name: string
  /** Free text exactly as the user entered it, e.g. "10 mg" or "5 mg/5 mL". */
  strength: string
  form: MedicationForm
  schedule: Schedule
  /** First day on the schedule. */
  startDate: LocalDate
  /** Last day on the schedule, inclusive; absent means ongoing. */
  endDate?: LocalDate
  notes: string
  createdAt: number
  updatedAt: number
}

/** What a form submits: everything but the bookkeeping fields. */
export type MedicationInput = Omit<Medication, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

export const LIMITS = {
  name: 100,
  strength: 40,
  notes: 1000,
  timesPerDay: 12,
} as const
