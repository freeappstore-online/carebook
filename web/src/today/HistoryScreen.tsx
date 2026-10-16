import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { useMedicationRepo } from '../meds/RepoContext'
import { expandDoses, WEEKDAYS } from '../meds/schedule'
import type { Medication } from '../meds/types'
import { type LocalDate, dateAt, deviceTimeZone } from '../meds/zoned'
import { type DayAdherence, adherenceByDay, calcPeriodAdherence } from './adherence'
import { type Month, addMonths, firstOfMonth, formatDay, formatMonth, lastOfMonth, monthGrid, monthOf } from './calendar'
import { type DoseLog, STATUS_LABELS } from './types'

export interface HistoryScreenProps {
  now?: () => number
  timeZone?: () => string
}

const button =
  'rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)] disabled:opacity-40'

const pct = (p: number | null) => (p === null ? '—' : `${p}%`)

function dayLabel(date: LocalDate, day: DayAdherence | undefined): string {
  const name = formatDay(date)
  if (!day || day.due === 0) return `${name}: no doses due`
  return `${name}: ${day.taken} of ${day.due} taken, ${pct(day.percent)}`
}

export function HistoryScreen({ now = Date.now, timeZone = deviceTimeZone }: HistoryScreenProps) {
  const repo = useMedicationRepo()
  const zone = timeZone()
  const at = now()
  const today = dateAt(at, zone)
  const [month, setMonth] = useState<Month>(() => monthOf(today))
  const [meds, setMeds] = useState<Medication[]>([])
  const [logs, setLogs] = useState<DoseLog[]>([])
  const [selected, setSelected] = useState<LocalDate | null>(null)
  const [loadError, setLoadError] = useState(false)

  const from = firstOfMonth(month)
  const lastDay = lastOfMonth(month)
  // Only days up to today have anything to show.
  const to = lastDay < today ? lastDay : today

  const reload = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([repo.list(), repo.listLogs({ from, to })])
      // Logs only count while their medication is on the list.
      const ids = new Set(m.map((med) => med.id))
      setMeds(m)
      setLogs(l.filter((log) => ids.has(log.medicationId)))
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [repo, from, to])

  useEffect(() => {
    void reload()
  }, [reload])

  const days = to >= from ? adherenceByDay(meds, logs, { from, to, timeZone: zone }, at) : []
  const byDate = new Map(days.map((d) => [d.date, d]))
  const period = calcPeriodAdherence(days)
  const isCurrentMonth = month >= monthOf(today)

  const go = (delta: number) => {
    setMonth((m) => addMonths(m, delta))
    setSelected(null)
  }

  return (
    <>
      <PageHeader
        title="History"
        description="The share of scheduled doses you logged as taken, day by day. A record to log and share with your clinician."
      />

      {loadError && (
        <p role="alert" className="mb-4 rounded-[var(--radius)] border border-[var(--line)] p-4 text-[var(--danger)]">
          Couldn’t open storage on this device. Private browsing can block it.
        </p>
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className={button} onClick={() => go(-1)} aria-label="Previous month">
          ‹ Prev
        </button>
        <h2 className="text-lg font-semibold text-[var(--ink)]" aria-live="polite">
          {formatMonth(month)}
        </h2>
        <button type="button" className={button} onClick={() => go(1)} disabled={isCurrentMonth} aria-label="Next month">
          Next ›
        </button>
      </div>

      <table className="w-full table-fixed border-separate border-spacing-1" aria-label={`Adherence, ${formatMonth(month)}`}>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="text-xs font-semibold text-[var(--muted)]">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week, i) => (
            <tr key={i}>
              {week.map((date, j) => {
                if (!date) return <td key={j} />
                const day = byDate.get(date)
                const shade = day?.percent ?? null
                return (
                  <td key={date} className="p-0">
                    <button
                      type="button"
                      disabled={date > today}
                      aria-label={dayLabel(date, day)}
                      aria-pressed={selected === date}
                      onClick={() => setSelected(selected === date ? null : date)}
                      className={`flex h-14 w-full flex-col items-center justify-center rounded-[var(--radius)] border text-[var(--ink)] disabled:opacity-40 ${
                        selected === date ? 'border-[var(--ink)]' : 'border-[var(--line)]'
                      } ${date === today ? 'font-semibold' : ''}`}
                      style={
                        shade === null
                          ? undefined
                          : { background: `color-mix(in srgb, var(--sky) ${Math.round(shade * 0.45)}%, transparent)` }
                      }
                    >
                      <span className="text-sm">{Number(date.slice(8))}</span>
                      <span className="text-xs tabular-nums text-[var(--muted)]" aria-hidden>
                        {day && day.due > 0 ? pct(day.percent) : ''}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4" aria-label="Month summary">
        {period.due === 0 ? (
          <p className="text-[var(--muted)]">No scheduled doses were due this month.</p>
        ) : (
          <>
            <p className="text-2xl font-semibold text-[var(--ink)]">{pct(period.percent)}</p>
            <p className="text-[var(--ink)]">
              {period.taken} of {period.due} due doses logged as taken · every dose taken on {period.daysAllTaken} of{' '}
              {period.daysWithDoses} days
            </p>
            <p className="text-sm text-[var(--muted)]">
              {period.skipped} skipped · {period.snoozed} snoozed · {period.missed} not logged
            </p>
          </>
        )}
        {period.asNeededTaken > 0 && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {period.asNeededTaken} as-needed {period.asNeededTaken === 1 ? 'dose' : 'doses'} logged (not counted in the %).
          </p>
        )}
      </section>

      {selected && <DayDetail date={selected} meds={meds} logs={logs} timeZone={zone} now={at} />}

      <p className="mt-6 text-sm text-[var(--muted)]">
        Adherence % is doses logged as taken divided by scheduled doses that were due. Skipped, snoozed and unlogged doses
        count as not taken; as-needed medications aren’t included. This is a log of what you entered, not medical advice.
      </p>
    </>
  )
}

interface DayDetailProps {
  date: LocalDate
  meds: Medication[]
  logs: DoseLog[]
  timeZone: string
  now: number
}

function DayDetail({ date, meds, logs, timeZone, now }: DayDetailProps) {
  const names = new Map(meds.map((m) => [m.id, m.name]))
  const dayLogs = logs.filter((l) => l.date === date)
  const logByKey = new Map(dayLogs.map((l) => [l.key, l]))
  const doses = expandDoses(meds, { from: date, to: date, timeZone })
  const asNeeded = dayLogs.filter((l) => l.asNeeded)

  return (
    <section className="mt-4" aria-labelledby="day-detail-heading">
      <h2 id="day-detail-heading" className="mb-2 font-semibold text-[var(--ink)]">
        {formatDay(date)}
      </h2>
      {doses.length === 0 && asNeeded.length === 0 ? (
        <p className="text-[var(--muted)]">Nothing scheduled or logged.</p>
      ) : (
        <ul className="grid gap-1">
          {doses.map((d) => {
            const log = logByKey.get(d.key)
            const status = log ? STATUS_LABELS[log.status] : d.at > now ? 'Upcoming' : 'Not logged'
            return (
              <li key={d.key} className="flex justify-between gap-2 border-b border-[var(--line)] py-1 text-[var(--ink)]">
                <span>
                  <span className="tabular-nums">{d.time}</span> {names.get(d.medicationId)}
                </span>
                <span className="text-[var(--muted)]">{status}</span>
              </li>
            )
          })}
          {asNeeded.map((l) => (
            <li key={l.key} className="flex justify-between gap-2 border-b border-[var(--line)] py-1 text-[var(--ink)]">
              <span>
                <span className="tabular-nums">{l.time}</span> {names.get(l.medicationId)}
              </span>
              <span className="text-[var(--muted)]">Taken (as needed)</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
