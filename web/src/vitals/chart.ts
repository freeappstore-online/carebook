// Geometry for the small SVG trend charts. Pure, so it can be tested.

import type { Point } from './stats'

/** About `count` evenly spaced round values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1
    min -= pad
    max += pad
  }
  // The smallest round step that needs at most count + 1 ticks.
  const ticksFor = (s: number) => Math.ceil(max / s) - Math.floor(min / s) + 1
  let power = 10 ** Math.floor(Math.log10((max - min) / (count + 1)))
  let step = power
  for (let found = false; !found; power *= 10) {
    for (const m of [1, 2, 2.5, 5]) {
      step = m * power
      if (ticksFor(step) <= count + 1) {
        found = true
        break
      }
    }
  }
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 1e6; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

export interface Frame {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface Plot {
  x: (at: number) => number
  y: (value: number) => number
  yTicks: number[]
}

/** Maps time to x across [start, end] and values to y across nice ticks. */
export function plot(points: readonly Point[], start: number, end: number, frame: Frame): Plot {
  const values = points.map((p) => p.value)
  const yTicks = values.length ? niceTicks(Math.min(...values), Math.max(...values)) : []
  const lo = yTicks[0] ?? 0
  const hi = yTicks[yTicks.length - 1] ?? 1
  const innerW = frame.width - frame.left - frame.right
  const innerH = frame.height - frame.top - frame.bottom
  const span = Math.max(1, end - start)
  return {
    x: (at) => frame.left + ((at - start) / span) * innerW,
    y: (value) => frame.top + innerH - ((value - lo) / (hi - lo || 1)) * innerH,
    yTicks,
  }
}

/** An SVG path through the points, in order. */
export function linePath(points: readonly Point[], p: Pick<Plot, 'x' | 'y'>): string {
  return points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${p.x(pt.at).toFixed(1)},${p.y(pt.value).toFixed(1)}`).join(' ')
}
