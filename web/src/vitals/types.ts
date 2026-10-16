import type { LocalDate, LocalTime } from '../meds/zoned'

export const ARMS = ['left', 'right'] as const
export type Arm = (typeof ARMS)[number]

export const POSITIONS = ['sitting', 'standing', 'lying'] as const
export type Position = (typeof POSITIONS)[number]

export const WEIGHT_UNITS = ['kg', 'lb'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

export const GLUCOSE_UNITS = ['mmol/L', 'mg/dL'] as const
export type GlucoseUnit = (typeof GLUCOSE_UNITS)[number]

export const ARM_LABELS: Record<Arm, string> = { left: 'Left arm', right: 'Right arm' }
export const POSITION_LABELS: Record<Position, string> = { sitting: 'Sitting', standing: 'Standing', lying: 'Lying down' }

/**
 * One vitals reading. Every measurement is optional, but a reading has at
 * least one; systolic and diastolic are always recorded together. Weight and
 * glucose keep the unit they were entered in.
 */
export interface Reading {
  id: string
  /** When the reading was taken. */
  takenAt: number
  /** The wall-clock date and time it was taken, where it was taken. */
  date: LocalDate
  time: LocalTime
  systolic?: number
  diastolic?: number
  pulse?: number
  arm?: Arm
  position?: Position
  weight?: { value: number; unit: WeightUnit }
  glucose?: { value: number; unit: GlucoseUnit }
  notes: string
  createdAt: number
  updatedAt: number
}

/** What the form submits. */
export interface ReadingInput {
  id?: string
  date: LocalDate
  time: LocalTime
  systolic?: number
  diastolic?: number
  pulse?: number
  arm?: Arm
  position?: Position
  weight?: { value: number; unit: WeightUnit }
  glucose?: { value: number; unit: GlucoseUnit }
  notes?: string
}

/**
 * Plausible ranges, only to catch typos (an extra digit, the wrong field).
 * They say nothing about what is healthy.
 */
export const RANGES = {
  systolic: [40, 300],
  diastolic: [20, 200],
  pulse: [20, 250],
  weightKg: [1, 500],
  glucoseMmol: [0.5, 60],
} as const

export const NOTES_MAX = 500

export const LB_PER_KG = 2.20462
/** mg/dL per mmol/L for glucose (molar mass 180.16 g/mol). */
export const MGDL_PER_MMOL = 18.016

export function toKg(w: { value: number; unit: WeightUnit }): number {
  return w.unit === 'kg' ? w.value : w.value / LB_PER_KG
}

export function weightIn(w: { value: number; unit: WeightUnit }, unit: WeightUnit): number {
  const kg = toKg(w)
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

export function toMmol(g: { value: number; unit: GlucoseUnit }): number {
  return g.unit === 'mmol/L' ? g.value : g.value / MGDL_PER_MMOL
}

export function glucoseIn(g: { value: number; unit: GlucoseUnit }, unit: GlucoseUnit): number {
  const mmol = toMmol(g)
  return unit === 'mmol/L' ? mmol : mmol * MGDL_PER_MMOL
}
