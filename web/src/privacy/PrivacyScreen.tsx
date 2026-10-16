import { type FormEvent, useRef, useState } from 'react'
import { ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui'
import { downloadBlob } from '../download'
import { useMedicationRepo } from '../meds/RepoContext'
import { type ParsedBackup, BackupError, backupFileName, buildBackup, describeBackup, parseBackup } from './backup'
import { clearPin, hasPin, isValidPin, setPin } from './pin'
import { PrivacyNote } from './PrivacyNote'

export interface PrivacyScreenProps {
  /** Locks the app now (only offered while a PIN is set). */
  onLock?: () => void
  now?: () => number
  storage?: Storage
}

const field = 'mt-1 w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'
const label = 'block text-sm font-semibold text-[var(--ink)]'
const primary = 'rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2 font-semibold text-[var(--paper)] disabled:opacity-60'
const quiet = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2 text-[var(--ink)] disabled:opacity-60'
const card = 'mt-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4'

export function PrivacyScreen({ onLock, now = Date.now, storage = localStorage }: PrivacyScreenProps) {
  return (
    <>
      <PageHeader
        title="Privacy and data"
        description="Carebook keeps your log on this device. Log and share with your clinician."
      />
      <PrivacyNote />
      <PinSettings onLock={onLock} storage={storage} />
      <Backups now={now} />
    </>
  )
}

function PinSettings({ onLock, storage }: { onLock?: () => void; storage: Storage }) {
  const [enabled, setEnabled] = useState(() => hasPin(storage))
  const [editing, setEditing] = useState(false)
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isValidPin(pin)) return setError('Use 4 to 8 digits.')
    if (pin !== confirm) return setError('The two PINs don’t match.')
    await setPin(pin, storage)
    const changed = enabled
    setEnabled(true)
    setEditing(false)
    setPinValue('')
    setConfirm('')
    setStatus(changed ? 'PIN changed.' : 'PIN set. Carebook will ask for it each time it opens.')
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)

  return (
    <section aria-labelledby="pin-heading" className={card}>
      <h2 id="pin-heading" className="text-lg font-semibold text-[var(--ink)]">
        PIN lock
      </h2>
      <p className="mt-1 text-[var(--muted)]">
        {enabled
          ? 'On. Carebook asks for your PIN each time it opens and after it’s been in the background for 5 minutes.'
          : 'Off. Add a PIN so Carebook asks for it each time it opens.'}{' '}
        The PIN is kept only on this device, as a scrambled hash. It keeps other people out of the app on a shared
        device; it doesn’t encrypt your data. If you forget it, the only way back in is to erase Carebook on this
        device, so keep a backup.
      </p>

      {editing ? (
        <form onSubmit={save} noValidate className="mt-3 grid gap-3 sm:max-w-xs">
          <div>
            <label className={label} htmlFor="new-pin">
              {enabled ? 'New PIN' : 'PIN'} <span className="font-normal text-[var(--muted)]">(4 to 8 digits)</span>
            </label>
            <input id="new-pin" className={field} type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPinValue(digits(e.target.value))} />
          </div>
          <div>
            <label className={label} htmlFor="confirm-pin">
              Type it again
            </label>
            <input id="confirm-pin" className={field} type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className={primary}>
              Save PIN
            </button>
            <button type="button" className={quiet} onClick={() => { setEditing(false); setError(null) }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={enabled ? quiet : primary} onClick={() => { setEditing(true); setStatus(null) }}>
            {enabled ? 'Change PIN' : 'Set a PIN'}
          </button>
          {enabled && (
            <>
              <button type="button" className={quiet} onClick={() => setRemoving(true)}>
                Remove PIN
              </button>
              {onLock && (
                <button type="button" className={quiet} onClick={onLock}>
                  Lock now
                </button>
              )}
            </>
          )}
        </div>
      )}
      <p className="mt-2 text-sm text-[var(--muted)]" aria-live="polite">
        {status}
      </p>

      <ConfirmDialog
        open={removing}
        title="Remove the PIN?"
        message="Carebook will open without asking for a PIN on this device."
        confirmLabel="Remove PIN"
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          clearPin(storage)
          setEnabled(false)
          setRemoving(false)
          setStatus('PIN removed.')
        }}
      />
    </section>
  )
}

function Backups({ now }: { now: () => number }) {
  const repo = useMedicationRepo()
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [busy, setBusy] = useState(false)

  const exportAll = async () => {
    setError(null)
    setStatus(null)
    try {
      const at = now()
      const backup = buildBackup(await repo.exportAll(), at)
      const name = backupFileName(at)
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), name)
      setStatus(`Saved ${name} with ${describeBackup(backup)}.`)
    } catch {
      setError('Couldn’t read your data on this device to export it.')
    }
  }

  const choose = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setStatus(null)
    try {
      setPending(parseBackup(await file.text()))
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Couldn’t read that file.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const importNow = async () => {
    if (!pending) return
    setBusy(true)
    const { backup } = pending
    setPending(null)
    try {
      await repo.replaceAll(backup)
      setStatus(`Imported ${describeBackup(backup)}.`)
    } catch {
      setError('The import didn’t finish, so nothing on this device was changed.')
    } finally {
      setBusy(false)
    }
  }

  const when = pending?.backup.exportedAt ? ` from ${pending.backup.exportedAt.slice(0, 10)}` : ''

  return (
    <section aria-labelledby="backup-heading" className={card}>
      <h2 id="backup-heading" className="text-lg font-semibold text-[var(--ink)]">
        Back up and restore
      </h2>
      <p className="mt-1 text-[var(--muted)]">
        Export saves everything Carebook holds (medications, dose log and readings) as one JSON file. It isn’t encrypted,
        so keep it somewhere private. Import replaces what’s on this device with a backup. The PIN isn’t included.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => void exportAll()}>
          Export JSON
        </button>
        <button type="button" className={quiet} disabled={busy} onClick={() => fileInput.current?.click()}>
          Import JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Backup file to import"
          tabIndex={-1}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--muted)]" aria-live="polite">
        {busy ? 'Importing…' : status}
      </p>

      <ConfirmDialog
        open={pending !== null}
        title="Replace your data with this backup?"
        message={
          pending
            ? [
                `The backup${when} has ${describeBackup(pending.backup)}. Everything Carebook holds on this device now will be replaced. This can’t be undone, so export first if you want to keep it.`,
                ...pending.warnings,
              ].join(' ')
            : ''
        }
        confirmLabel="Replace and import"
        variant="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => void importNow()}
      />
    </section>
  )
}
