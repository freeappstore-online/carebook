import { FORMS, LIMITS, type MedicationForm, type MedicationInput, type Schedule } from './types'
import { dayNumber, isValidDate, isValidTime } from './zoned'

export class MedicationError extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'MedicationError'
    this.field = field
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function text(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new MedicationError(field, `${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new MedicationError(field, `${field} must be ${max} characters or fewer`)
  return trimmed
}

function times(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new MedicationError('times', 'Add at least one time')
  if (!value.every((t) => typeof t === 'string' && isValidTime(t))) {
    throw new MedicationError('times', 'Times must be HH:MM')
  }
  const unique = [...new Set(value as string[])].sort()
  if (unique.length > LIMITS.timesPerDay) {
    throw new MedicationError('times', `Up to ${LIMITS.timesPerDay} times a day`)
  }
  return unique
}

/** Checks a schedule and returns a clean copy (sorted, de-duplicated). */
export function normalizeSchedule(value: unknown): Schedule {
  if (!isRecord(value)) throw new MedicationError('schedule', 'Choose a schedule')
  switch (value.kind) {
    case 'as-needed':
      return { kind: 'as-needed' }
    case 'daily':
      return { kind: 'daily', times: times(value.times) }
    case 'weekly': {
      const days = value.days
      if (!Array.isArray(days) || days.length === 0) throw new MedicationError('days', 'Choose at least one day')
      if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
        throw new MedicationError('days', 'Days must be 0 (Sunday) to 6 (Saturday)')
      }
      return { kind: 'weekly', days: [...new Set(days as number[])].sort((a, b) => a - b), times: times(value.times) }
    }
    default:
      throw new MedicationError('schedule', 'Choose a schedule')
  }
}

/** Checks form or imported input and returns the stored fields, trimmed. */
export function normalizeMedicationInput(value: unknown): Omit<MedicationInput, 'id'> {
  if (!isRecord(value)) throw new MedicationError('medication', 'Not a medication')
  const name = text(value.name, 'name', LIMITS.name)
  if (!name) throw new MedicationError('name', 'Enter a name')
  const form = value.form
  if (typeof form !== 'string' || !(FORMS as readonly string[]).includes(form)) {
    throw new MedicationError('form', 'Choose a form')
  }
  const startDate = value.startDate
  if (typeof startDate !== 'string' || !isValidDate(startDate)) {
    throw new MedicationError('startDate', 'Start date must be a valid date')
  }
  const endDate = value.endDate === undefined || value.endDate === '' ? undefined : value.endDate
  if (endDate !== undefined) {
    if (typeof endDate !== 'string' || !isValidDate(endDate)) {
      throw new MedicationError('endDate', 'End date must be a valid date')
    }
    if (dayNumber(endDate) < dayNumber(startDate)) {
      throw new MedicationError('endDate', 'End date must be on or after the start date')
    }
  }
  return {
    name,
    strength: text(value.strength, 'strength', LIMITS.strength),
    form: form as MedicationForm,
    schedule: normalizeSchedule(value.schedule),
    startDate,
    ...(endDate ? { endDate } : {}),
    notes: text(value.notes, 'notes', LIMITS.notes),
  }
}
