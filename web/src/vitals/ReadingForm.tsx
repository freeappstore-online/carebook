import { type FormEvent, useState } from 'react'
import {
  ARMS,
  ARM_LABELS,
  GLUCOSE_UNITS,
  type GlucoseUnit,
  NOTES_MAX,
  POSITIONS,
  POSITION_LABELS,
  type Reading,
  type ReadingInput,
  WEIGHT_UNITS,
  type WeightUnit,
} from './types'
import type { Units } from './stats'
import { ReadingError } from './validate'

interface Draft {
  date: string
  time: string
  systolic: string
  diastolic: string
  pulse: string
  arm: string
  position: string
  weight: string
  weightUnit: WeightUnit
  glucose: string
  glucoseUnit: GlucoseUnit
  notes: string
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n))

function draftFrom(r: Reading | undefined, now: { date: string; time: string }, units: Units): Draft {
  return {
    date: r?.date ?? now.date,
    time: r?.time ?? now.time,
    systolic: str(r?.systolic),
    diastolic: str(r?.diastolic),
    pulse: str(r?.pulse),
    arm: r?.arm ?? '',
    position: r?.position ?? '',
    weight: str(r?.weight?.value),
    weightUnit: r?.weight?.unit ?? units.weight,
    glucose: str(r?.glucose?.value),
    glucoseUnit: r?.glucose?.unit ?? units.glucose,
    notes: r?.notes ?? '',
  }
}

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')))

function toInput(d: Draft, id: string | undefined): ReadingInput {
  const weight = num(d.weight)
  const glucose = num(d.glucose)
  return {
    ...(id ? { id } : {}),
    date: d.date,
    time: d.time,
    systolic: num(d.systolic),
    diastolic: num(d.diastolic),
    pulse: num(d.pulse),
    arm: (d.arm || undefined) as ReadingInput['arm'],
    position: (d.position || undefined) as ReadingInput['position'],
    weight: weight === undefined ? undefined : { value: weight, unit: d.weightUnit },
    glucose: glucose === undefined ? undefined : { value: glucose, unit: d.glucoseUnit },
    notes: d.notes,
  }
}

const field = 'mt-1 w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'
const label = 'block text-sm font-semibold text-[var(--ink)]'
const optional = <span className="font-normal text-[var(--muted)]">(optional)</span>
const quietButton = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)]'

export interface ReadingFormProps {
  reading?: Reading
  now: { date: string; time: string }
  units: Units
  onSave: (input: ReadingInput) => Promise<void>
  onCancel: () => void
}

export function ReadingForm({ reading, now, units, onSave, onCancel }: ReadingFormProps) {
  const [draft, setDraft] = useState(() => draftFrom(reading, now, units))
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(toInput(draft, reading?.id))
    } catch (err) {
      if (err instanceof ReadingError) setError({ field: err.field, message: err.message })
      else setError({ field: 'save', message: 'Couldn’t save on this device. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  const errorFor = (...fields: string[]) =>
    error && fields.includes(error.field) ? (
      <p role="alert" className="mt-1 text-sm text-[var(--danger)]">
        {error.message}
      </p>
    ) : null

  const numberInput = (key: 'systolic' | 'diastolic' | 'pulse' | 'weight' | 'glucose', id: string, decimal = false) => (
    <input
      id={id}
      className={field}
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={draft[key]}
      onChange={(e) => set(key, e.target.value)}
    />
  )

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="text-sm text-[var(--muted)]">
        Enter the numbers from your monitor or meter. Fill in what you measured; everything is optional except the date
        and time. Log and share with your clinician.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="vital-date">
            Date
          </label>
          <input id="vital-date" type="date" className={field} value={draft.date} onChange={(e) => set('date', e.target.value)} />
          {errorFor('date')}
        </div>
        <div>
          <label className={label} htmlFor="vital-time">
            Time
          </label>
          <input id="vital-time" type="time" className={field} value={draft.time} onChange={(e) => set('time', e.target.value)} />
          {errorFor('time')}
        </div>
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-1 font-semibold text-[var(--ink)]">Blood pressure</legend>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label} htmlFor="vital-sys">
              Systolic <span className="font-normal text-[var(--muted)]">mmHg</span>
            </label>
            {numberInput('systolic', 'vital-sys')}
          </div>
          <div>
            <label className={label} htmlFor="vital-dia">
              Diastolic <span className="font-normal text-[var(--muted)]">mmHg</span>
            </label>
            {numberInput('diastolic', 'vital-dia')}
          </div>
          <div>
            <label className={label} htmlFor="vital-pulse">
              Pulse <span className="font-normal text-[var(--muted)]">bpm</span>
            </label>
            {numberInput('pulse', 'vital-pulse')}
          </div>
        </div>
        {errorFor('systolic', 'diastolic', 'pulse')}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="vital-arm">
              Arm {optional}
            </label>
            <select id="vital-arm" className={field} value={draft.arm} onChange={(e) => set('arm', e.target.value)}>
              <option value="">Not recorded</option>
              {ARMS.map((a) => (
                <option key={a} value={a}>
                  {ARM_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="vital-position">
              Position {optional}
            </label>
            <select id="vital-position" className={field} value={draft.position} onChange={(e) => set('position', e.target.value)}>
              <option value="">Not recorded</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="vital-weight">
            Weight {optional}
          </label>
          <div className="flex gap-2">
            {numberInput('weight', 'vital-weight', true)}
            <select
              aria-label="Weight unit"
              className={`${field} w-24`}
              value={draft.weightUnit}
              onChange={(e) => set('weightUnit', e.target.value as WeightUnit)}
            >
              {WEIGHT_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          {errorFor('weight')}
        </div>
        <div>
          <label className={label} htmlFor="vital-glucose">
            Glucose {optional}
          </label>
          <div className="flex gap-2">
            {numberInput('glucose', 'vital-glucose', true)}
            <select
              aria-label="Glucose unit"
              className={`${field} w-28`}
              value={draft.glucoseUnit}
              onChange={(e) => set('glucoseUnit', e.target.value as GlucoseUnit)}
            >
              {GLUCOSE_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          {errorFor('glucose')}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="vital-notes">
          Notes {optional}
        </label>
        <textarea
          id="vital-notes"
          className={field}
          rows={2}
          maxLength={NOTES_MAX}
          value={draft.notes}
          placeholder="For example, before or after a meal"
          onChange={(e) => set('notes', e.target.value)}
        />
        {errorFor('notes')}
      </div>

      {errorFor('reading', 'arm', 'position', 'save', 'id')}

      <div className="flex justify-end gap-2">
        <button type="button" className={quietButton} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2 font-semibold text-[var(--paper)] disabled:opacity-60"
        >
          {reading ? 'Save changes' : 'Save reading'}
        </button>
      </div>
    </form>
  )
}
