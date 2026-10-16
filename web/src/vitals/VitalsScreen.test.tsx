// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MedicationRepoContext } from '../meds/RepoContext'
import { type MedicationRepository, createMedicationRepository } from '../meds/repository'
import { VitalsScreen } from './VitalsScreen'

let dbCount = 0
const repos: MedicationRepository[] = []

// 14:00 UTC on 16 October 2026 is 10:00 in New York.
const NOW = Date.parse('2026-10-16T14:00:00Z')
const TZ = 'America/New_York'

async function setup(seed: (repo: MedicationRepository) => Promise<unknown> = async () => {}) {
  const repo = createMedicationRepository({ dbName: `vitals-${++dbCount}` })
  repos.push(repo)
  await seed(repo)
  render(
    <MedicationRepoContext.Provider value={repo}>
      <VitalsScreen now={() => NOW} timeZone={() => TZ} />
    </MedicationRepoContext.Provider>,
  )
  return { repo, user: userEvent.setup() }
}

afterEach(async () => {
  cleanup()
  await Promise.all(repos.splice(0).map((r) => r.close()))
})

describe('VitalsScreen', () => {
  it('adds a blood-pressure reading and shows it with its neutral AHA label', async () => {
    const { repo, user } = await setup()
    await user.click(await screen.findByRole('button', { name: 'Add reading' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add reading' })
    expect(within(dialog).getByText(/Log and share with your clinician/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-16')
    expect(within(dialog).getByLabelText('Time')).toHaveValue('10:00')

    await user.type(within(dialog).getByLabelText(/Systolic/), '134')
    await user.type(within(dialog).getByLabelText(/Diastolic/), '84')
    await user.type(within(dialog).getByLabelText(/Pulse/), '66')
    await user.selectOptions(within(dialog).getByLabelText(/Arm/), 'left')
    await user.selectOptions(within(dialog).getByLabelText(/Position/), 'sitting')
    await user.click(within(dialog).getByRole('button', { name: 'Save reading' }))

    const list = await screen.findByRole('list', { name: 'Readings' })
    const row = within(list).getByRole('listitem')
    expect(row).toHaveTextContent('134/84 mmHg · pulse 66 bpm')
    expect(row).toHaveTextContent('AHA category: High blood pressure stage 1 · Left arm, Sitting')
    expect(screen.getByText(/not a diagnosis/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Blood pressure: 1 reading, average 134\/84 mmHg/ })).toBeInTheDocument()

    const [saved] = await repo.listReadings({ from: '2026-10-16', to: '2026-10-16' })
    expect(saved).toMatchObject({ systolic: 134, diastolic: 84, pulse: 66, arm: 'left', position: 'sitting', takenAt: NOW })
  })

  it('explains what is wrong instead of saving', async () => {
    const { repo, user } = await setup()
    await user.click(await screen.findByRole('button', { name: 'Add reading' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save reading' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter at least one measurement')

    await user.type(within(dialog).getByLabelText(/Systolic/), '80')
    await user.type(within(dialog).getByLabelText(/Diastolic/), '120')
    await user.click(within(dialog).getByRole('button', { name: 'Save reading' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/swapped/)
    expect(await repo.latestReading()).toBeUndefined()
  })

  it('averages over 7, 30 and 90 days and charts weight in the latest unit', async () => {
    const { user } = await setup(async (repo) => {
      await repo.saveReading({ date: '2026-10-15', time: '08:00', systolic: 120, diastolic: 80 }, TZ)
      await repo.saveReading({ date: '2026-10-01', time: '08:00', systolic: 140, diastolic: 90 }, TZ)
      await repo.saveReading({ date: '2026-08-01', time: '08:00', systolic: 160, diastolic: 100 }, TZ)
      await repo.saveReading({ date: '2026-10-14', time: '08:00', weight: { value: 80, unit: 'kg' } }, TZ)
      await repo.saveReading({ date: '2026-10-16', time: '07:00', weight: { value: 180, unit: 'lb' } }, TZ)
    })
    const averages = await screen.findByRole('region', { name: 'Averages' })
    // 30 days by default: 15 Oct and 1 Oct.
    await waitFor(() => expect(averages).toHaveTextContent('130/85 mmHg2 readings'))
    // (80 kg ≈ 176.4 lb + 180 lb) / 2, in lb because that was used last.
    expect(averages).toHaveTextContent('178.2 lb')
    expect(screen.getByRole('img', { name: /Weight: 2 readings, average 178.2 lb/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '7 days' }))
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(averages).toHaveTextContent('120/80 mmHg1 reading'))

    await user.click(screen.getByRole('button', { name: '90 days' }))
    await waitFor(() => expect(averages).toHaveTextContent('140/90 mmHg3 readings'))
  })

  it('edits and deletes a reading', async () => {
    const { repo, user } = await setup((r) => r.saveReading({ date: '2026-10-16', time: '07:00', pulse: 70 }, TZ))
    await user.click(await screen.findByRole('button', { name: 'Edit reading from Today, 07:00' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit reading' })
    const pulse = within(dialog).getByLabelText(/Pulse/)
    await user.clear(pulse)
    await user.type(pulse, '72')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('pulse 72 bpm')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete reading from Today, 07:00' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('No readings yet')).toBeInTheDocument()
    expect(await repo.latestReading()).toBeUndefined()
  })
})
