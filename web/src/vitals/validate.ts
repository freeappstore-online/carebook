import { isValidDate, isValidTime } from '../meds/zoned'
import {
  ARMS,
  GLUCOSE_UNITS,
  type GlucoseUnit,
  NOTES_MAX,
  POSITIONS,
  RANGES,
  type ReadingInput,
  WEIGHT_UNITS,
  type WeightUnit,
  toKg,
  toMmol,
} from './types'

export class ReadingError extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'ReadingError'
    this.field = field
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const present = (v: unknown) => v !== undefined && v !== null && v !== ''

function whole(value: unknown, field: string, label: string, [min, max]: readonly [number, number]): number | undefined {
  if (!present(value)) return undefined
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ReadingError(field, `${label} must be a whole number`)
  }
  if (n < min || n > max) throw new ReadingError(field, `${label} must be between ${min} and ${max}. Check for a typo.`)
  return n
}

function measured<U extends string>(
  value: unknown,
  field: string,
  label: string,
  units: readonly U[],
  toBase: (v: { value: number; unit: U }) => number,
  [min, max]: readonly [number, number],
  baseUnit: string,
): { value: number; unit: U } | undefined {
  if (!present(value)) return undefined
  if (!isRecord(value) || !present(value.value)) return undefined
  const n = typeof value.value === 'string' ? Number(value.value) : value.value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new ReadingError(field, `${label} must be a number`)
  if (typeof value.unit !== 'string' || !(units as readonly string[]).includes(value.unit)) {
    throw new ReadingError(field, `Choose a unit for ${label.toLowerCase()}`)
  }
  const m = { value: Math.round(n * 10) / 10, unit: value.unit as U }
  const base = toBase(m)
  if (base < min || base > max) {
    throw new ReadingError(field, `${label} must be between ${min} and ${max} ${baseUnit} (or the same in other units). Check for a typo.`)
  }
  return m
}

export type NormalizedReading = Omit<ReadingInput, 'id' | 'notes'> & { notes: string }

/** Checks form or imported input; returns the stored fields. */
export function normalizeReadingInput(value: unknown): NormalizedReading {
  if (!isRecord(value)) throw new ReadingError('reading', 'Not a reading')
  if (typeof value.date !== 'string' || !isValidDate(value.date)) throw new ReadingError('date', 'Enter a valid date')
  if (typeof value.time !== 'string' || !isValidTime(value.time)) throw new ReadingError('time', 'Enter a valid time')

  const systolic = whole(value.systolic, 'systolic', 'Systolic', RANGES.systolic)
  const diastolic = whole(value.diastolic, 'diastolic', 'Diastolic', RANGES.diastolic)
  if ((systolic === undefined) !== (diastolic === undefined)) {
    throw new ReadingError(systolic === undefined ? 'systolic' : 'diastolic', 'Enter both systolic and diastolic')
  }
  if (systolic !== undefined && diastolic !== undefined && diastolic >= systolic) {
    throw new ReadingError('diastolic', 'Diastolic is usually the lower number. Check the two aren’t swapped.')
  }
  const pulse = whole(value.pulse, 'pulse', 'Pulse', RANGES.pulse)
  const weight = measured<WeightUnit>(value.weight, 'weight', 'Weight', WEIGHT_UNITS, toKg, RANGES.weightKg, 'kg')
  const glucose = measured<GlucoseUnit>(value.glucose, 'glucose', 'Glucose', GLUCOSE_UNITS, toMmol, RANGES.glucoseMmol, 'mmol/L')

  if (systolic === undefined && pulse === undefined && !weight && !glucose) {
    throw new ReadingError('reading', 'Enter at least one measurement')
  }

  const arm = present(value.arm) ? value.arm : undefined
  if (arm !== undefined && !(ARMS as readonly unknown[]).includes(arm)) throw new ReadingError('arm', 'Choose an arm')
  const position = present(value.position) ? value.position : undefined
  if (position !== undefined && !(POSITIONS as readonly unknown[]).includes(position)) {
    throw new ReadingError('position', 'Choose a position')
  }

  const notes = present(value.notes) ? value.notes : ''
  if (typeof notes !== 'string') throw new ReadingError('notes', 'Notes must be text')
  if (notes.trim().length > NOTES_MAX) throw new ReadingError('notes', `Notes must be ${NOTES_MAX} characters or fewer`)

  // Arm and position describe a blood-pressure reading only.
  const bp = systolic !== undefined
  return {
    date: value.date,
    time: value.time,
    ...(bp ? { systolic, diastolic } : {}),
    ...(pulse !== undefined ? { pulse } : {}),
    ...(bp && arm ? { arm: arm as ReadingInput['arm'] } : {}),
    ...(bp && position ? { position: position as ReadingInput['position'] } : {}),
    ...(weight ? { weight } : {}),
    ...(glucose ? { glucose } : {}),
    notes: notes.trim(),
  }
}
