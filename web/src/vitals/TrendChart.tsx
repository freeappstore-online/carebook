import { type Frame, linePath, plot } from './chart'
import type { Point } from './stats'

export interface ChartSeries {
  label: string
  points: Point[]
  /** A CSS colour, e.g. `var(--accent-deep)`. */
  color: string
  dashed?: boolean
}

export interface TrendChartProps {
  title: string
  unit: string
  series: ChartSeries[]
  start: number
  end: number
  /** Read out instead of the drawing, e.g. "12 readings, average 128/82 mmHg". */
  summary: string
  /** Tick labels for the x axis: [at, text] pairs. */
  xLabels: [number, string][]
}

const FRAME: Frame = { width: 640, height: 200, left: 44, right: 12, top: 12, bottom: 26 }

/** A small line chart. Colours tell series apart only; nothing is colour-coded by value. */
export function TrendChart({ title, unit, series, start, end, summary, xLabels }: TrendChartProps) {
  const all = series.flatMap((s) => s.points)
  const p = plot(all, start, end, FRAME)
  const bottom = FRAME.height - FRAME.bottom

  return (
    <figure className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-[var(--ink)]">
          {title} <span className="text-sm font-normal text-[var(--muted)]">({unit})</span>
        </span>
        {series.length > 1 && (
          <span className="flex gap-3 text-xs text-[var(--muted)]" aria-hidden>
            {series.map((s) => (
              <span key={s.label} className="flex items-center gap-1">
                <svg width="16" height="6">
                  <line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} />
                </svg>
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      {all.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No readings in this period.</p>
      ) : (
        <svg
          viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
          className="mt-2 h-auto w-full"
          role="img"
          aria-label={`${title}: ${summary}`}
        >
          {p.yTicks.map((t) => (
            <g key={t}>
              <line x1={FRAME.left} x2={FRAME.width - FRAME.right} y1={p.y(t)} y2={p.y(t)} stroke="var(--line-strong)" />
              <text x={FRAME.left - 6} y={p.y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          {xLabels.map(([at, text], i) => (
            <text
              key={at}
              x={p.x(at)}
              y={bottom + 18}
              fontSize="11"
              fill="var(--muted)"
              textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            >
              {text}
            </text>
          ))}
          {series.map((s) => (
            <g key={s.label}>
              {s.points.length > 1 && (
                <path
                  d={linePath(s.points, p)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                  strokeLinejoin="round"
                />
              )}
              {s.points.map((pt) => (
                <circle key={pt.at} cx={p.x(pt.at)} cy={p.y(pt.value)} r="3" fill={s.color} />
              ))}
            </g>
          ))}
        </svg>
      )}
    </figure>
  )
}
