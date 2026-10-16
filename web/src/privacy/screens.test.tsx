// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MedicationRepoContext } from '../meds/RepoContext'
import { type MedicationRepository, SCHEMA_VERSION, createMedicationRepository } from '../meds/repository'
import { LOGS, MEDS, READINGS } from '../report/fixtures'
import { BACKUP_FORMAT, buildBackup } from './backup'
import { LockScreen } from './LockScreen'
import { hasPin, setPin } from './pin'
import { PrivacyNote } from './PrivacyNote'
import { PrivacyScreen } from './PrivacyScreen'

let dbCount = 0
const repos: MedicationRepository[] = []
let downloads: { name: string; blob: Blob }[] = []

beforeEach(() => {
  localStorage.clear()
  downloads = []
  let lastBlob: Blob | undefined
  URL.createObjectURL = vi.fn((b: Blob) => {
    lastBlob = b
    return 'blob:x'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: lastBlob! })
  })
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all(repos.splice(0).map((r) => r.close()))
})

function renderPrivacy(repo = createMedicationRepository({ dbName: `privacy-${++dbCount}` }), onLock = vi.fn()) {
  repos.push(repo)
  render(
    <MedicationRepoContext.Provider value={repo}>
      <PrivacyScreen now={() => Date.parse('2026-10-16T11:00:00Z')} onLock={onLock} />
    </MedicationRepoContext.Provider>,
  )
  return { repo, onLock, user: userEvent.setup() }
}

describe('PrivacyNote', () => {
  it('says the data stays on the device, discloses analytics and sign-in, and gives no advice', () => {
    render(<PrivacyNote />)
    const note = screen.getByRole('region', { name: 'Your privacy' })
    expect(note).toHaveTextContent('Everything stays on this device')
    expect(note).toHaveTextContent('There is no Carebook account and no cloud sync')
    expect(note).toHaveTextContent('FreeAppStore analytics script from api.freeappstore.online')
    expect(note).toHaveTextContent('Cloudflare Web Analytics')
    expect(note).toHaveTextContent('Carebook never sends it what you enter')
    expect(note).toHaveTextContent('Optional FreeAppStore sign-in')
    expect(note).toHaveTextContent('doesn’t give medical advice, a diagnosis or dosing suggestions')
    expect(note).toHaveTextContent('Log and share with your clinician')
    expect(note.textContent).not.toMatch(/\b(should|recommend|treat|cure)\b/i)
  })
})

describe('PrivacyScreen: PIN', () => {
  it('sets, changes and removes a PIN, and locks on request', async () => {
    const { user, onLock } = renderPrivacy()
    const pinSection = screen.getByRole('region', { name: 'PIN lock' })
    expect(pinSection).toHaveTextContent(/^PIN lockOff\./)

    await user.click(within(pinSection).getByRole('button', { name: 'Set a PIN' }))
    await user.type(within(pinSection).getByLabelText(/^PIN/), '12')
    await user.type(within(pinSection).getByLabelText('Type it again'), '12')
    await user.click(within(pinSection).getByRole('button', { name: 'Save PIN' }))
    expect(within(pinSection).getByRole('alert')).toHaveTextContent('Use 4 to 8 digits.')

    await user.clear(within(pinSection).getByLabelText(/^PIN/))
    await user.type(within(pinSection).getByLabelText(/^PIN/), '2468')
    await user.clear(within(pinSection).getByLabelText('Type it again'))
    await user.type(within(pinSection).getByLabelText('Type it again'), '2469')
    await user.click(within(pinSection).getByRole('button', { name: 'Save PIN' }))
    expect(within(pinSection).getByRole('alert')).toHaveTextContent('don’t match')

    await user.clear(within(pinSection).getByLabelText('Type it again'))
    await user.type(within(pinSection).getByLabelText('Type it again'), '2468')
    await user.click(within(pinSection).getByRole('button', { name: 'Save PIN' }))
    expect(await within(pinSection).findByText(/PIN set/)).toBeInTheDocument()
    expect(hasPin()).toBe(true)

    await user.click(within(pinSection).getByRole('button', { name: 'Lock now' }))
    expect(onLock).toHaveBeenCalledOnce()

    await user.click(within(pinSection).getByRole('button', { name: 'Remove PIN' }))
    const confirm = await screen.findByRole('dialog', { name: 'Remove the PIN?' })
    await user.click(within(confirm).getByRole('button', { name: 'Remove PIN' }))
    await waitFor(() => expect(hasPin()).toBe(false))
    expect(within(pinSection).getByText('PIN removed.')).toBeInTheDocument()
  })
})

describe('PrivacyScreen: backups', () => {
  it('exports everything as one JSON file', async () => {
    const repo = createMedicationRepository({ dbName: `privacy-${++dbCount}` })
    await repo.replaceAll({ medications: MEDS, adherence: LOGS, vitals: READINGS })
    const { user } = renderPrivacy(repo)
    await user.click(screen.getByRole('button', { name: 'Export JSON' }))
    expect(await screen.findByText(/Saved carebook-backup-2026-10-16.json with 3 medications/)).toBeInTheDocument()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].name).toBe('carebook-backup-2026-10-16.json')
    const backup = JSON.parse(await downloads[0].blob.text())
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: '2026-10-16T11:00:00.000Z' })
    expect(backup.medications).toHaveLength(3)
    expect(backup.adherence).toHaveLength(LOGS.length)
    expect(backup.vitals).toHaveLength(READINGS.length)
  })

  it('imports a backup after confirmation, replacing what was there', async () => {
    const { repo, user } = renderPrivacy()
    await repo.saveReading({ date: '2026-01-01', time: '08:00', pulse: 99 }, 'UTC')
    const text = JSON.stringify(buildBackup({ medications: MEDS, adherence: LOGS, vitals: READINGS }, Date.parse('2026-10-15T09:00:00Z')))
    await user.upload(screen.getByLabelText('Backup file to import'), new File([text], 'backup.json', { type: 'application/json' }))

    const dialog = await screen.findByRole('dialog', { name: 'Replace your data with this backup?' })
    expect(dialog).toHaveTextContent('The backup from 2026-10-15 has 3 medications')
    // Nothing changes until it's confirmed.
    expect((await repo.exportAll()).vitals).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Replace and import' }))

    expect(await screen.findByText(/^Imported 3 medications/)).toBeInTheDocument()
    const after = await repo.exportAll()
    expect(after.medications).toHaveLength(3)
    expect(after.vitals.map((r) => r.id).sort()).toEqual(READINGS.map((r) => r.id).sort())
  })

  it('explains why a file can’t be imported and changes nothing', async () => {
    const { repo, user } = renderPrivacy()
    await repo.saveReading({ date: '2026-01-01', time: '08:00', pulse: 99 }, 'UTC')
    const input = screen.getByLabelText('Backup file to import')

    await user.upload(input, new File(['not json'], 'x.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t valid JSON')

    const newer = JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION + 1, medications: [] })
    await user.upload(input, new File([newer], 'y.json', { type: 'application/json' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('newer version of Carebook')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await repo.exportAll()).vitals).toHaveLength(1)
  })

  it('warns before importing a backup from an older version', async () => {
    const { user } = renderPrivacy()
    const v2 = JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: 2, exportedAt: '2026-05-01T00:00:00Z', medications: MEDS, adherence: [] })
    await user.upload(screen.getByLabelText('Backup file to import'), new File([v2], 'old.json', { type: 'application/json' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('older version of Carebook (data version 2; this one uses 3)')
  })
})

describe('LockScreen', () => {
  it('unlocks with the right PIN only', async () => {
    await setPin('2468')
    const onUnlock = vi.fn()
    render(<LockScreen onUnlock={onUnlock} onErase={vi.fn()} />)
    const user = userEvent.setup()
    expect(screen.getByRole('heading', { name: 'Carebook is locked' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('PIN'), '1111')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('That PIN isn’t right. Try again.')).toBeInTheDocument()
    expect(onUnlock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('PIN')).toHaveValue('')

    await user.type(screen.getByLabelText('PIN'), '2468')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(onUnlock).toHaveBeenCalledOnce())
  })

  it('offers to erase everything when the PIN is forgotten', async () => {
    await setPin('2468')
    const onErase = vi.fn(async () => {})
    render(<LockScreen onUnlock={vi.fn()} onErase={onErase} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Forgot your PIN?' }))
    const dialog = await screen.findByRole('dialog', { name: 'Erase Carebook on this device?' })
    expect(dialog).toHaveTextContent('can’t be recovered')
    await user.click(within(dialog).getByRole('button', { name: 'Erase everything' }))
    expect(onErase).toHaveBeenCalledOnce()
  })
})
