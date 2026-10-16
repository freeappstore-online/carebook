// Averages and chart series over a window of days. Pure functions.

import { type LocalDate, addDays } from '../meds/zoned'
import { type GlucoseUnit, type Reading, type WeightUnit, glucoseIn, weightIn } from './types'

export const WINDOWS = [7, 30, 90] as const
export type WindowDays = (typeof WINDOWS)[number]

/** The inclusive date range for the last `days` days, ending today. */
export function windowRange(today: LocalDate, days: number): { from: LocalDate; to: LocalDate } {
  return { from: addDays(today, -(days - 1)), to: today }
}

export const inRange = (r: Reading, range: { from: LocalDate; to: LocalDate }) =>
  r.date >= range.from && r.date <= range.to

export interface Summary {
  count: number
  mean: number
  min: number
  max: number
}

/** Mean, min and max, or undefined for no values. */
export function summarize(values: readonly number[]): Summary | undefined {
  if (values.length === 0) return undefined
  let sum = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const v of values) {
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  return { count: values.length, mean: sum / values.length, min, max }
}

export interface VitalsAverages {
  readings: number
  systolic?: Summary
  diastolic?: Summary
  pulse?: Summary
  weight?: Summary & { unit: WeightUnit }
  glucose?: Summary & { unit: GlucoseUnit }
}

export interface Units {
  weight: WeightUnit
  glucose: GlucoseUnit
}

/** The units of the most recent weight and glucose readings, else kg and mmol/L. */
export function preferredUnits(readings: readonly Reading[]): Units {
  const latest = [...readings].sort((a, b) => b.takenAt - a.takenAt)
  return {
    weight: latest.find((r) => r.weight)?.weight?.unit ?? 'kg',
    glucose: latest.find((r) => r.glucose)?.glucose?.unit ?? 'mmol/L',
  }
}

/** Averages of every measurement in `readings`, with weight and glucose in `units`. */
export function averages(readings: readonly Reading[], units: Units): VitalsAverages {
  const pick = (f: (r: Reading) => number | undefined) =>
    readings.map(f).filter((v): v is number => v !== undefined)
  const weight = summarize(pick((r) => (r.weight ? weightIn(r.weight, units.weight) : undefined)))
  const glucose = summarize(pick((r) => (r.glucose ? glucoseIn(r.glucose, units.glucose) : undefined)))
  return {
    readings: readings.length,
    systolic: summarize(pick((r) => r.systolic)),
    diastolic: summarize(pick((r) => r.diastolic)),
    pulse: summarize(pick((r) => r.pulse)),
    ...(weight ? { weight: { ...weight, unit: units.weight } } : {}),
    ...(glucose ? { glucose: { ...glucose, unit: units.glucose } } : {}),
  }
}

export interface Point {
  at: number
  value: number
}

/** One measurement's points in time order. */
export function series(readings: readonly Reading[], value: (r: Reading) => number | undefined): Point[] {
  return readings
    .map((r) => ({ at: r.takenAt, value: value(r) }))
    .filter((p): p is Point => p.value !== undefined)
    .sort((a, b) => a.at - b.at)
}

/** Rounds for display: whole numbers for mmHg and bpm, one decimal otherwise. */
export function fmt(value: number, decimals = 0): string {
  const f = 10 ** decimals
  return (Math.round(value * f) / f).toFixed(decimals)
}
