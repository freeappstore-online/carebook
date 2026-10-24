import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog, EmptyState, Modal, PageHeader } from '@freeappstore/sdk/ui'
import { buildAllICS, buildICS } from '../calendar/ics'
import { downloadBlob } from '../download'
import { MedicationForm } from './MedicationForm'
import { useMedicationRepo } from './RepoContext'
import { describeSchedule, nextDose } from './schedule'
import { FORM_LABELS, type Medication, type MedicationInput } from './types'
import { dateAt, deviceTimeZone } from './zoned'

export interface MedicationsScreenProps {
  now?: () => number
  timeZone?: () => string
}

type Editing = { mode: 'add' } | { mode: 'edit'; medication: Medication } | null

const primaryButton = 'rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2 font-semibold text-[var(--paper)]'
const quietButton = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]'

export function MedicationsScreen({ now = Date.now, timeZone = deviceTimeZone }: MedicationsScreenProps) {
  const repo = useMedicationRepo()
  const [meds, setMeds] = useState<Medication[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [removing, setRemoving] = useState<Medication | null>(null)
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setMeds(await repo.list())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [repo])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = async (input: MedicationInput) => {
    await repo.save(input)
    setEditing(null)
    await reload()
  }

  const remove = async () => {
    if (!removing) return
    await repo.remove(removing.id)
    setRemoving(null)
    await reload()
  }

  const zone = timeZone()
  const today = dateAt(now(), zone)
  const downloadCalendar = (selected: readonly Medication[], fileName: string) => {
    try {
      const ics = selected.length === 1 ? buildICS(selected[0], zone, now()) : buildAllICS(selected, zone, now())
      if (!ics) return setCalendarStatus('No scheduled calendar events to export.')
      downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), fileName)
      setCalendarStatus(`Downloaded ${fileName}. Import it into your calendar app.`)
    } catch {
      setCalendarStatus('Couldn’t make the calendar file on this device.')
    }
  }
  const add = (
    <button type="button" className={primaryButton} onClick={() => setEditing({ mode: 'add' })}>
      Add medication
    </button>
  )

  return (
    <>
      <PageHeader
        title="Medications"
        description="Your list, kept on this device. Log and share with your clinician."
        actions={meds && meds.length > 0 ? add : undefined}
      />

      {loadError && (
        <p role="alert" className="rounded-[var(--radius)] border border-[var(--line)] p-4 text-[var(--danger)]">
          Couldn’t open storage on this device. Private browsing can block it.
        </p>
      )}

      {meds && meds.length === 0 && (
        <EmptyState title="No medications yet" message="Add the medications you want to keep a log of." action={add} />
      )}

      {meds && meds.length > 0 && (
        <>
          <section aria-label="Calendar reminders" className="mb-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="font-semibold text-[var(--ink)]">Calendar reminders</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Save a calendar file, then review and import it into your chosen calendar app. Event and alert text is neutral, but the times can be sensitive and your calendar may sync them to the cloud. Events use local clock times. Calendar apps may interpret skipped or repeated times near clock changes differently from Carebook; review imported events near daylight-saving changes. Edits, stopping a medication and deleting Carebook data do not change imported events: remove or replace old events yourself. Importing twice may create duplicates. Your calendar app controls alerts, permissions and delivery.
            </p>
            <button type="button" className={`${quietButton} mt-3`} disabled={!meds.some((med) => med.schedule.kind !== 'as-needed')} onClick={() => downloadCalendar(meds, 'carebook-reminders.ics')}>
              Export all reminders
            </button>
            <p className="mt-2 text-sm text-[var(--muted)]" role="status">{calendarStatus}</p>
          </section>
          <ul className="grid gap-3" aria-label="Medications">
            {meds.map((med) => (
            <MedicationCard
              key={med.id}
              med={med}
              now={now()}
              timeZone={zone}
              today={today}
              onEdit={() => setEditing({ mode: 'edit', medication: med })}
              onRemove={() => setRemoving(med)}
              onCalendar={() => downloadCalendar([med], 'carebook-reminder.ics')}
            />
            ))}
          </ul>
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === 'edit' ? 'Edit medication' : 'Add medication'}
        maxWidth={560}
      >
        {editing && (
          <MedicationForm
            medication={editing.mode === 'edit' ? editing.medication : undefined}
            today={today}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title="Remove medication?"
        message={`Remove ${removing?.name ?? 'this medication'} and its logged doses from this device? To keep its history, set an end date instead.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

interface CardProps {
  med: Medication
  now: number
  timeZone: string
  today: string
  onEdit: () => void
  onRemove: () => void
  onCalendar: () => void
}

function MedicationCard({ med, now, timeZone, today, onEdit, onRemove, onCalendar }: CardProps) {
  const ended = med.endDate !== undefined && med.endDate < today
  const next = ended ? undefined : nextDose(med, now, timeZone)
  const detail = [med.strength, FORM_LABELS[med.form]].filter(Boolean).join(' · ')

  return (
    <li className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-[var(--ink)]">{med.name}</h2>
          <p className="text-sm text-[var(--muted)]">{detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {med.schedule.kind !== 'as-needed' && (
            <button type="button" className={quietButton} onClick={onCalendar} aria-label={`Add to Calendar for ${med.name}`}>
              Add to Calendar
            </button>
          )}
          <button type="button" className={quietButton} onClick={onEdit} aria-label={`Edit ${med.name}`}>
            Edit
          </button>
          <button type="button" className={quietButton} onClick={onRemove} aria-label={`Remove ${med.name}`}>
            Remove
          </button>
        </div>
      </div>
      <p className="mt-2 text-[var(--ink)]">{describeSchedule(med.schedule)}</p>
      {med.schedule.kind === 'as-needed' && <p className="text-sm text-[var(--muted)]">As-needed medications have no scheduled calendar events.</p>}
      <p className="text-sm text-[var(--muted)]">
        {ended
          ? `Ended ${med.endDate}`
          : med.startDate > today
            ? `Starts ${med.startDate}`
            : next
              ? `Next: ${next.date === today ? 'today' : next.date} at ${next.time}`
              : med.endDate
                ? `Until ${med.endDate}`
                : null}
      </p>
      {med.notes && <p className="mt-2 whitespace-pre-line text-sm text-[var(--muted)]">{med.notes}</p>}
    </li>
  )
}
