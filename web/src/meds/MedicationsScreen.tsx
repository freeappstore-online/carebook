import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog, EmptyState, Modal, PageHeader } from '@freeappstore/sdk/ui'
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
            />
          ))}
        </ul>
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
}

function MedicationCard({ med, now, timeZone, today, onEdit, onRemove }: CardProps) {
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
        <div className="flex gap-2">
          <button type="button" className={quietButton} onClick={onEdit} aria-label={`Edit ${med.name}`}>
            Edit
          </button>
          <button type="button" className={quietButton} onClick={onRemove} aria-label={`Remove ${med.name}`}>
            Remove
          </button>
        </div>
      </div>
      <p className="mt-2 text-[var(--ink)]">{describeSchedule(med.schedule)}</p>
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
