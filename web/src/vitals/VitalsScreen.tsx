import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog, EmptyState, Modal, PageHeader } from '@freeappstore/sdk/ui'
import { useMedicationRepo } from '../meds/RepoContext'
import { type LocalDate, addDays, dateAt, deviceTimeZone, parseDate, timeAt, zonedToEpoch } from '../meds/zoned'
import { BP_CATEGORY_LABELS, BP_NOTE, bpCategory } from './bp'
import { ReadingForm } from './ReadingForm'
import { type Units, WINDOWS, type WindowDays, averages, fmt, preferredUnits, series, windowRange } from './stats'
import { TrendChart } from './TrendChart'
import { ARM_LABELS, POSITION_LABELS, type Reading, type ReadingInput, glucoseIn, weightIn } from './types'

export interface VitalsScreenProps {
  now?: () => number
  timeZone?: () => string
}

type Editing = { mode: 'add' } | { mode: 'edit'; reading: Reading } | null

const primaryButton = 'rounded-[var(--radius)] bg-[var(--accent-deep)] px-4 py-2 font-semibold text-white'
const quietButton = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]'

const glucoseDecimals = (unit: string) => (unit === 'mmol/L' ? 1 : 0)

function shortDate(date: LocalDate): string {
  const p = parseDate(date)
  if (!p) return date
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    Date.UTC(p.year, p.month - 1, p.day),
  )
}

export function VitalsScreen({ now = Date.now, timeZone = deviceTimeZone }: VitalsScreenProps) {
  const repo = useMedicationRepo()
  const zone = timeZone()
  const at = now()
  const today = dateAt(at, zone)
  const [days, setDays] = useState<WindowDays>(30)
  const [readings, setReadings] = useState<Reading[] | null>(null)
  const [units, setUnits] = useState<Units>({ weight: 'kg', glucose: 'mmol/L' })
  const [hasAny, setHasAny] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [removing, setRemoving] = useState<Reading | null>(null)

  const range = windowRange(today, days)
  const { from, to } = range

  const reload = useCallback(async () => {
    try {
      const [list, latest] = await Promise.all([repo.listReadings({ from, to }), repo.latestReading()])
      setReadings(list)
      setHasAny(latest !== undefined)
      setUnits(preferredUnits(latest ? [...list, latest] : list))
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [repo, from, to])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = async (input: ReadingInput) => {
    await repo.saveReading(input, zone)
    setEditing(null)
    await reload()
  }

  const remove = async () => {
    if (!removing) return
    await repo.removeReading(removing.id)
    setRemoving(null)
    await reload()
  }

  const add = (
    <button type="button" className={primaryButton} onClick={() => setEditing({ mode: 'add' })}>
      Add reading
    </button>
  )

  const list = readings ?? []
  const avg = averages(list, units)
  const start = zonedToEpoch(range.from, '00:00', zone)
  const end = zonedToEpoch(addDays(range.to, 1), '00:00', zone)
  const xLabels: [number, string][] = [
    [start, shortDate(range.from)],
    [zonedToEpoch(addDays(range.from, Math.floor(days / 2)), '00:00', zone), shortDate(addDays(range.from, Math.floor(days / 2)))],
    [end, shortDate(range.to)],
  ]
  const count = (n: number) => `${n} ${n === 1 ? 'reading' : 'readings'}`

  return (
    <>
      <PageHeader
        title="Vitals"
        description="Blood pressure, pulse, weight and glucose, kept on this device. Log and share with your clinician."
        actions={hasAny ? add : undefined}
      />

      {loadError && (
        <p role="alert" className="mb-4 rounded-[var(--radius)] border border-[var(--line)] p-4 text-[var(--danger)]">
          Couldn’t open storage on this device. Private browsing can block it.
        </p>
      )}

      {readings && !hasAny && (
        <EmptyState title="No readings yet" message="Add a reading from your monitor, scale or meter." action={add} />
      )}

      {readings && hasAny && (
        <>
          <div role="group" aria-label="Period" className="flex gap-2">
            {WINDOWS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days === d}
                onClick={() => setDays(d)}
                className={`rounded-[var(--radius)] border px-3 py-1.5 text-sm ${
                  days === d
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--line-strong)] text-[var(--ink)]'
                }`}
              >
                {d} days
              </button>
            ))}
          </div>

          <section aria-label="Averages" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Blood pressure"
              value={avg.systolic && avg.diastolic ? `${fmt(avg.systolic.mean)}/${fmt(avg.diastolic.mean)}` : '—'}
              unit="mmHg"
              detail={avg.systolic ? count(avg.systolic.count) : undefined}
            />
            <Stat label="Pulse" value={avg.pulse ? fmt(avg.pulse.mean) : '—'} unit="bpm" detail={avg.pulse ? count(avg.pulse.count) : undefined} />
            <Stat
              label="Weight"
              value={avg.weight ? fmt(avg.weight.mean, 1) : '—'}
              unit={units.weight}
              detail={avg.weight ? count(avg.weight.count) : undefined}
            />
            <Stat
              label="Glucose"
              value={avg.glucose ? fmt(avg.glucose.mean, glucoseDecimals(units.glucose)) : '—'}
              unit={units.glucose}
              detail={avg.glucose ? count(avg.glucose.count) : undefined}
            />
          </section>
          <p className="mt-2 text-sm text-[var(--muted)]">Averages of every reading in the last {days} days.</p>

          <div className="mt-4 grid gap-4">
            <TrendChart
              title="Blood pressure"
              unit="mmHg"
              start={start}
              end={end}
              xLabels={xLabels}
              series={[
                { label: 'Systolic', points: series(list, (r) => r.systolic), color: 'var(--accent-deep)' },
                { label: 'Diastolic', points: series(list, (r) => r.diastolic), color: 'var(--sky-deep)', dashed: true },
              ]}
              summary={
                avg.systolic && avg.diastolic
                  ? `${count(avg.systolic.count)}, average ${fmt(avg.systolic.mean)}/${fmt(avg.diastolic.mean)} mmHg, systolic ${avg.systolic.min} to ${avg.systolic.max}, diastolic ${avg.diastolic.min} to ${avg.diastolic.max}`
                  : 'no readings'
              }
            />
            <TrendChart
              title="Pulse"
              unit="bpm"
              start={start}
              end={end}
              xLabels={xLabels}
              series={[{ label: 'Pulse', points: series(list, (r) => r.pulse), color: 'var(--mint-deep)' }]}
              summary={avg.pulse ? `${count(avg.pulse.count)}, average ${fmt(avg.pulse.mean)} bpm` : 'no readings'}
            />
            {avg.weight && (
              <TrendChart
                title="Weight"
                unit={units.weight}
                start={start}
                end={end}
                xLabels={xLabels}
                series={[
                  {
                    label: 'Weight',
                    points: series(list, (r) => (r.weight ? Math.round(weightIn(r.weight, units.weight) * 10) / 10 : undefined)),
                    color: 'var(--accent-deep)',
                  },
                ]}
                summary={`${count(avg.weight.count)}, average ${fmt(avg.weight.mean, 1)} ${units.weight}`}
              />
            )}
            {avg.glucose && (
              <TrendChart
                title="Glucose"
                unit={units.glucose}
                start={start}
                end={end}
                xLabels={xLabels}
                series={[
                  {
                    label: 'Glucose',
                    points: series(list, (r) => {
                      if (!r.glucose) return undefined
                      const f = 10 ** glucoseDecimals(units.glucose)
                      return Math.round(glucoseIn(r.glucose, units.glucose) * f) / f
                    }),
                    color: 'var(--sky-deep)',
                  },
                ]}
                summary={`${count(avg.glucose.count)}, average ${fmt(avg.glucose.mean, glucoseDecimals(units.glucose))} ${units.glucose}`}
              />
            )}
          </div>

          <h2 className="mt-8 mb-2 text-lg font-semibold text-[var(--ink)]">Readings</h2>
          {list.length === 0 ? (
            <p className="text-[var(--muted)]">No readings in the last {days} days.</p>
          ) : (
            <ul className="grid gap-3" aria-label="Readings">
              {[...list].reverse().map((r) => (
                <ReadingRow
                  key={r.id}
                  reading={r}
                  today={today}
                  onEdit={() => setEditing({ mode: 'edit', reading: r })}
                  onRemove={() => setRemoving(r)}
                />
              ))}
            </ul>
          )}

          <p className="mt-6 text-sm text-[var(--muted)]">{BP_NOTE}</p>
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'edit' ? 'Edit reading' : 'Add reading'}
        maxWidth={560}
      >
        {editing && (
          <ReadingForm
            reading={editing.mode === 'edit' ? editing.reading : undefined}
            now={{ date: today, time: timeAt(at, zone) }}
            units={units}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title="Delete reading?"
        message="Delete this reading from this device?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

function Stat({ label, value, unit, detail }: { label: string; value: string; unit: string; detail?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-3">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-[var(--ink)]">
        {value} <span className="text-sm font-normal text-[var(--muted)]">{unit}</span>
      </p>
      {detail && <p className="text-xs text-[var(--muted)]">{detail}</p>}
    </div>
  )
}

interface ReadingRowProps {
  reading: Reading
  today: LocalDate
  onEdit: () => void
  onRemove: () => void
}

function ReadingRow({ reading: r, today, onEdit, onRemove }: ReadingRowProps) {
  const category = bpCategory(r.systolic, r.diastolic)
  const when = `${r.date === today ? 'Today' : shortDate(r.date)}, ${r.time}`
  const parts = [
    r.systolic !== undefined ? `${r.systolic}/${r.diastolic} mmHg` : undefined,
    r.pulse !== undefined ? `pulse ${r.pulse} bpm` : undefined,
    r.weight ? `${r.weight.value} ${r.weight.unit}` : undefined,
    r.glucose ? `glucose ${r.glucose.value} ${r.glucose.unit}` : undefined,
  ].filter(Boolean)
  const context = [r.arm ? ARM_LABELS[r.arm] : undefined, r.position ? POSITION_LABELS[r.position] : undefined].filter(Boolean)

  return (
    <li className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4" aria-label={`${when}: ${parts.join(', ')}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-[var(--muted)]">{when}</p>
          <p className="font-semibold tabular-nums text-[var(--ink)]">{parts.join(' · ')}</p>
          {category && (
            <p className="text-sm text-[var(--muted)]">
              AHA category: {BP_CATEGORY_LABELS[category]}
              {context.length > 0 && ` · ${context.join(', ')}`}
            </p>
          )}
          {!category && context.length > 0 && <p className="text-sm text-[var(--muted)]">{context.join(', ')}</p>}
          {r.notes && <p className="mt-1 whitespace-pre-line text-sm text-[var(--muted)]">{r.notes}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" className={quietButton} onClick={onEdit} aria-label={`Edit reading from ${when}`}>
            Edit
          </button>
          <button type="button" className={quietButton} onClick={onRemove} aria-label={`Delete reading from ${when}`}>
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}
