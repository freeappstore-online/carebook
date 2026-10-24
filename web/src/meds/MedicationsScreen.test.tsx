// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MedicationRepoContext } from './RepoContext'
import { MedicationsScreen } from './MedicationsScreen'
import { type MedicationRepository, createMedicationRepository } from './repository'

let dbCount = 0
const repos: MedicationRepository[] = []

// 14:00 UTC on 16 October 2026 is 10:00 in New York.
const NOW = Date.parse('2026-10-16T14:00:00Z')
const downloads: HTMLAnchorElement[] = []
const blobs: Blob[] = []

beforeEach(() => {
  downloads.length = 0
  blobs.length = 0
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return 'blob:calendar'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this)
  })
})

async function setup(seed: (repo: MedicationRepository) => Promise<unknown> = async () => {}) {
  const repo = createMedicationRepository({ dbName: `screen-${++dbCount}` })
  repos.push(repo)
  await seed(repo)
  render(
    <MedicationRepoContext.Provider value={repo}>
      <MedicationsScreen now={() => NOW} timeZone={() => 'America/New_York'} />
    </MedicationRepoContext.Provider>,
  )
  return { repo, user: userEvent.setup() }
}

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all(repos.splice(0).map((r) => r.close()))
})

describe('MedicationsScreen', () => {
  it('downloads one or all calendar reminders locally and explains sync', async () => {
    const { repo, user } = await setup(async (repo) => {
      await repo.save({ name: 'Example', strength: '10 mg', form: 'tablet', schedule: { kind: 'daily', times: ['08:00'] }, startDate: '2026-10-01', notes: '' })
      await repo.save({ name: 'As needed', strength: '', form: 'tablet', schedule: { kind: 'as-needed' }, startDate: '2026-10-01', notes: '' })
    })
    expect(await screen.findByText(/your calendar may sync them to the cloud/i)).toBeInTheDocument()
    expect(screen.getByText('As-needed medications have no scheduled calendar events.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to Calendar for As needed' })).not.toBeInTheDocument()
    const before = await repo.exportAll()

    await user.click(screen.getByRole('button', { name: 'Add to Calendar for Example' }))
    expect(downloads).toHaveLength(1)
    expect(downloads[0].download).toBe('carebook-reminder.ics')
    expect(blobs[0].type).toBe('text/calendar;charset=utf-8')
    expect(await blobs[0].text()).toContain('SUMMARY:Reminder')
    expect(await blobs[0].text()).not.toContain('Example')
    expect(await blobs[0].text()).not.toContain('10 mg')

    await user.click(screen.getByRole('button', { name: 'Export all reminders' }))
    expect(downloads).toHaveLength(2)
    expect(downloads[1].download).toBe('carebook-reminders.ics')
    expect((await blobs[1].text()).match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(await blobs[1].text()).not.toContain('As needed')
    expect(await repo.exportAll()).toEqual(before)
  })

  it('adds a medication with a daily schedule and shows the next dose', async () => {
    const { repo, user } = await setup()
    await user.click(await screen.findByRole('button', { name: 'Add medication' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add medication' })
    expect(within(dialog).getByText(/log and share with your clinician/i)).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Name'), 'Example')
    await user.type(within(dialog).getByLabelText(/Strength/), '10 mg')
    await user.type(within(dialog).getByLabelText('Time 1'), '08:00')
    await user.click(within(dialog).getByRole('button', { name: 'Add a time' }))
    await user.type(within(dialog).getByLabelText('Time 2'), '20:00')
    await user.click(within(dialog).getByRole('button', { name: 'Add medication' }))

    const list = await screen.findByRole('list', { name: 'Medications' })
    expect(within(list).getByRole('heading', { name: 'Example' })).toBeInTheDocument()
    expect(within(list).getByText('10 mg · Tablet')).toBeInTheDocument()
    expect(within(list).getByText('Every day at 08:00 and 20:00')).toBeInTheDocument()
    expect(within(list).getByText('Next: today at 20:00')).toBeInTheDocument()

    const [saved] = await repo.list()
    expect(saved).toMatchObject({ name: 'Example', startDate: '2026-10-16', schedule: { kind: 'daily', times: ['08:00', '20:00'] } })
  })

  it('shows what is missing instead of saving', async () => {
    const { repo, user } = await setup()
    await user.click(await screen.findByRole('button', { name: 'Add medication' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add medication' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a name')

    await user.type(within(dialog).getByLabelText('Name'), 'Example')
    await user.click(within(dialog).getByLabelText('Specific days'))
    await user.type(within(dialog).getByLabelText('Time 1'), '09:00')
    await user.click(within(dialog).getByRole('button', { name: 'Add medication' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose at least one day')
    expect(await repo.list()).toEqual([])
  })

  it('edits and removes a medication', async () => {
    const { repo, user } = await setup((repo) =>
      repo.save({
      name: 'Example',
      strength: '',
      form: 'inhaler',
      schedule: { kind: 'daily', times: ['08:00'] },
      startDate: '2026-10-01',
      notes: '',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Edit Example' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit medication' })
    await user.click(within(dialog).getByLabelText('As needed'))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(within(screen.getByRole('list', { name: 'Medications' })).getByText('As needed')).toBeInTheDocument()
    expect((await repo.list())[0].schedule).toEqual({ kind: 'as-needed' })

    await user.click(screen.getByRole('button', { name: 'Remove Example' }))
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByText('No medications yet')).toBeInTheDocument())
    expect(await repo.list()).toEqual([])
  })
})
