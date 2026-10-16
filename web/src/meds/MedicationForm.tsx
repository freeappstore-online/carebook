import { type FormEvent, useState } from 'react'
import { WEEKDAYS } from './schedule'
import { FORMS, FORM_LABELS, LIMITS, type Medication, type MedicationForm as Form, type MedicationInput, type ScheduleKind } from './types'
import { MedicationError } from './validate'

interface Draft {
  name: string
  strength: string
  form: Form
  kind: ScheduleKind
  times: string[]
  days: number[]
  startDate: string
  endDate: string
  notes: string
}

function draftFrom(med: Medication | undefined, today: string): Draft {
  const s = med?.schedule
  return {
    name: med?.name ?? '',
    strength: med?.strength ?? '',
    form: med?.form ?? 'tablet',
    kind: s?.kind ?? 'daily',
    times: s && s.kind !== 'as-needed' ? [...s.times] : [''],
    days: s?.kind === 'weekly' ? [...s.days] : [],
    startDate: med?.startDate ?? today,
    endDate: med?.endDate ?? '',
    notes: med?.notes ?? '',
  }
}

function toInput(d: Draft, id: string | undefined): MedicationInput {
  const times = d.times.filter(Boolean)
  const schedule =
    d.kind === 'as-needed'
      ? ({ kind: 'as-needed' } as const)
      : d.kind === 'weekly'
        ? ({ kind: 'weekly', days: d.days, times } as const)
        : ({ kind: 'daily', times } as const)
  return {
    ...(id ? { id } : {}),
    name: d.name,
    strength: d.strength,
    form: d.form,
    schedule,
    startDate: d.startDate,
    ...(d.endDate ? { endDate: d.endDate } : {}),
    notes: d.notes,
  }
}

const field = 'mt-1 w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'
const label = 'block text-sm font-semibold text-[var(--ink)]'
const quietButton = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-2 text-sm text-[var(--ink)]'

export interface MedicationFormProps {
  medication?: Medication
  today: string
  onSave: (input: MedicationInput) => Promise<void>
  onCancel: () => void
}

export function MedicationForm({ medication, today, onSave, onCancel }: MedicationFormProps) {
  const [draft, setDraft] = useState(() => draftFrom(medication, today))
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(toInput(draft, medication?.id))
    } catch (err) {
      if (err instanceof MedicationError) setError({ field: err.field, message: err.message })
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

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="text-sm text-[var(--muted)]">
        Enter the details as they appear on your prescription or pharmacy label. Carebook keeps a log;
        it doesn’t check or suggest doses. Log and share with your clinician.
      </p>

      <div>
        <label className={label} htmlFor="med-name">
          Name
        </label>
        <input
          id="med-name"
          data-autofocus
          className={field}
          value={draft.name}
          maxLength={LIMITS.name}
          onChange={(e) => set('name', e.target.value)}
          autoComplete="off"
        />
        {errorFor('name')}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="med-strength">
            Strength <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input
            id="med-strength"
            className={field}
            value={draft.strength}
            maxLength={LIMITS.strength}
            placeholder="As on the label"
            onChange={(e) => set('strength', e.target.value)}
            autoComplete="off"
          />
          {errorFor('strength')}
        </div>
        <div>
          <label className={label} htmlFor="med-form">
            Form
          </label>
          <select id="med-form" className={field} value={draft.form} onChange={(e) => set('form', e.target.value as Form)}>
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {FORM_LABELS[f]}
              </option>
            ))}
          </select>
          {errorFor('form')}
        </div>
      </div>

      <fieldset>
        <legend className={label}>Schedule</legend>
        <div className="mt-1 flex flex-wrap gap-4">
          {(
            [
              ['daily', 'Every day'],
              ['weekly', 'Specific days'],
              ['as-needed', 'As needed'],
            ] as const
          ).map(([kind, text]) => (
            <label key={kind} className="flex items-center gap-2 text-[var(--ink)]">
              <input type="radio" name="schedule-kind" checked={draft.kind === kind} onChange={() => set('kind', kind)} />
              {text}
            </label>
          ))}
        </div>
        {errorFor('schedule')}
      </fieldset>

      {draft.kind === 'weekly' && (
        <fieldset>
          <legend className={label}>Days</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {WEEKDAYS.map((name, day) => (
              <label key={name} className="flex items-center gap-1 text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={draft.days.includes(day)}
                  onChange={(e) =>
                    set('days', e.target.checked ? [...draft.days, day] : draft.days.filter((d) => d !== day))
                  }
                />
                {name}
              </label>
            ))}
          </div>
          {errorFor('days')}
        </fieldset>
      )}

      {draft.kind !== 'as-needed' && (
        <fieldset>
          <legend className={label}>Times</legend>
          <ul className="mt-1 grid gap-2">
            {draft.times.map((time, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  aria-label={`Time ${i + 1}`}
                  className={`${field} mt-0 max-w-40`}
                  value={time}
                  onChange={(e) => set('times', draft.times.map((t, j) => (j === i ? e.target.value : t)))}
                />
                {draft.times.length > 1 && (
                  <button
                    type="button"
                    className={quietButton}
                    aria-label={`Remove time ${i + 1}`}
                    onClick={() => set('times', draft.times.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {draft.times.length < LIMITS.timesPerDay && (
            <button type="button" className={`${quietButton} mt-2`} onClick={() => set('times', [...draft.times, ''])}>
              Add a time
            </button>
          )}
          <p className="mt-1 text-sm text-[var(--muted)]">Times follow the clock wherever you are, including after a clock change.</p>
          {errorFor('times')}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="med-start">
            Start date
          </label>
          <input id="med-start" type="date" className={field} value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} />
          {errorFor('startDate')}
        </div>
        <div>
          <label className={label} htmlFor="med-end">
            End date <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input id="med-end" type="date" className={field} value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} />
          {errorFor('endDate')}
        </div>
      </div>

      <div>
        <label className={label} htmlFor="med-notes">
          Notes <span className="font-normal text-[var(--muted)]">(optional)</span>
        </label>
        <textarea
          id="med-notes"
          className={field}
          rows={3}
          value={draft.notes}
          maxLength={LIMITS.notes}
          placeholder="For example, what the label says or who prescribed it"
          onChange={(e) => set('notes', e.target.value)}
        />
        {errorFor('notes')}
      </div>

      {errorFor('save', 'id', 'medication')}

      <div className="flex justify-end gap-2">
        <button type="button" className={quietButton} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[var(--radius)] bg-[var(--accent-deep)] px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {medication ? 'Save changes' : 'Add medication'}
        </button>
      </div>
    </form>
  )
}
