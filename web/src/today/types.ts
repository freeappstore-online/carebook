import type { LocalDate, LocalTime } from '../meds/zoned'

export const DOSE_STATUSES = ['taken', 'skipped', 'snoozed'] as const
export type DoseStatus = (typeof DOSE_STATUSES)[number]

export const STATUS_LABELS: Record<DoseStatus, string> = {
  taken: 'Taken',
  skipped: 'Skipped',
  snoozed: 'Snoozed',
}

/** How long "Snooze" puts a dose off. */
export const SNOOZE_MINUTES = 15

/**
 * What the user logged for one dose. Scheduled doses use the schedule's key
 * (`medId|date|time`); as-needed doses get `medId|date|prn-<loggedAt>`.
 */
export interface DoseLog {
  key: string
  medicationId: string
  date: LocalDate
  /** The scheduled wall time, or the wall time an as-needed dose was logged. */
  time: LocalTime
  status: DoseStatus
  /** True for a dose of an as-needed medication (not on a schedule). */
  asNeeded?: true
  /** For `snoozed`: when the dose comes back as due. */
  snoozedUntil?: number
  loggedAt: number
}

export const asNeededKey = (medicationId: string, date: LocalDate, loggedAt: number) =>
  `${medicationId}|${date}|prn-${loggedAt}`
