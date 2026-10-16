// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MedicationRepoContext } from '../meds/RepoContext'
import { type MedicationRepository, createMedicationRepository } from '../meds/repository'
import { doseKey } from '../meds/schedule'
import type { MedicationInput } from '../meds/types'
import { HistoryScreen } from './HistoryScreen'
import { TodayScreen } from './TodayScreen'

let dbCount = 0
const repos: MedicationRepository[] = []

// 14:00 UTC on Friday 16 October 2026 is 10:00 in New York.
const NOW = Date.parse('2026-10-16T14:00:00Z')
const TZ = 'America/New_York'

const daily: MedicationInput = {
  name: 'Example',
  strength: '10 mg',
  form: 'tablet',
  schedule: { kind: 'daily', times: ['08:00', '20:00'] },
  startDate: '2026-10-15',
  notes: '',
}
const prn: MedicationInput = { ...daily, name: 'Relief', strength: '', schedule: { kind: 'as-needed' } }

async function makeRepo(seed: (repo: MedicationRepository) => Promise<unknown> = async () => {}) {
  const repo = createMedicationRepository({ dbName: `screens-${++dbCount}`, now: () => NOW })
  repos.push(repo)
  await seed(repo)
  return repo
}

const withRepo = (repo: MedicationRepository, ui: ReactNode) =>
  render(<MedicationRepoContext.Provider value={repo}>{ui}</MedicationRepoContext.Provider>)

afterEach(async () => {
  cleanup()
  await Promise.all(repos.splice(0).map((r) => r.close()))
})

describe('TodayScreen', () => {
  it('lists today’s doses and logs taken, snoozed and undo', async () => {
    let medId = ''
    const repo = await makeRepo(async (r) => {
      medId = (await r.save(daily)).id
    })
    withRepo(repo, <TodayScreen now={() => NOW} timeZone={() => TZ} />)
    const user = userEvent.setup()

    const list = await screen.findByRole('list', { name: 'Scheduled doses' })
    expect(within(list).getByRole('listitem', { name: 'Example at 08:00: Due' })).toBeInTheDocument()
    expect(within(list).getByRole('listitem', { name: 'Example at 20:00: Upcoming' })).toBeInTheDocument()
    expect(screen.getByText('0 of 1 due dose logged as taken, 1 still to come.')).toBeInTheDocument()
    expect(screen.getByText(/log and share with your clinician/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Taken: Example at 08:00' }))
    expect(await screen.findByRole('listitem', { name: 'Example at 08:00: Taken' })).toBeInTheDocument()
    expect(screen.getByText('1 of 1 due dose logged as taken, 1 still to come.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Snooze 15 minutes: Example at 20:00' }))
    expect(await screen.findByRole('listitem', { name: 'Example at 20:00: Snoozed until 10:15' })).toBeInTheDocument()
    // A snoozed dose can still be logged.
    await user.click(screen.getByRole('button', { name: 'Skipped: Example at 20:00' }))
    expect(await screen.findByRole('listitem', { name: 'Example at 20:00: Skipped' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo Example at 08:00' }))
    expect(await screen.findByRole('listitem', { name: 'Example at 08:00: Due' })).toBeInTheDocument()

    const logs = await repo.listLogs({ from: '2026-10-16', to: '2026-10-16' })
    expect(logs.map((l) => [l.key, l.status])).toEqual([[doseKey(medId, '2026-10-16', '20:00'), 'skipped']])
  })

  it('logs as-needed doses separately', async () => {
    const repo = await makeRepo((r) => r.save(prn))
    withRepo(repo, <TodayScreen now={() => NOW} timeZone={() => TZ} />)
    const user = userEvent.setup()

    expect(await screen.findByText('No scheduled doses today.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log a dose of Relief' }))
    const taken = await screen.findByRole('list', { name: 'Relief doses logged today' })
    expect(within(taken).getByText(/Taken at 10:00/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo Relief at 10:00' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Relief doses logged today' })).not.toBeInTheDocument())
  })

  it('points to Medications when the list is empty', async () => {
    const repo = await makeRepo()
    const visited: string[] = []
    withRepo(repo, <TodayScreen now={() => NOW} timeZone={() => TZ} onNavigate={(h) => visited.push(h)} />)
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Go to Medications' }))
    expect(visited).toEqual(['/medications'])
  })
})

describe('HistoryScreen', () => {
  it('shows per-day adherence for the current month and a month summary', async () => {
    const repo = await makeRepo(async (r) => {
      const { id } = await r.save(daily)
      const set = (date: string, time: string, status: 'taken' | 'skipped') =>
        r.setStatus({ key: doseKey(id, date, time), medicationId: id, date, time }, status)
      await set('2026-10-15', '08:00', 'taken')
      await set('2026-10-15', '20:00', 'taken')
      await set('2026-10-16', '08:00', 'skipped')
      await r.logAsNeeded((await r.save(prn)).id, TZ)
      await r.logAsNeeded('removed-medication', TZ)
    })
    withRepo(repo, <HistoryScreen now={() => NOW} timeZone={() => TZ} />)
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { name: /October 2026/ })).toBeInTheDocument()
    const grid = screen.getByRole('table', { name: /Adherence, October 2026/ })
    expect(await within(grid).findByRole('button', { name: oct(15, ': 2 of 2 taken, 100%') })).toBeInTheDocument()
    // 20:00 today is still ahead, so only 08:00 counts.
    expect(within(grid).getByRole('button', { name: oct(16, ': 0 of 1 taken, 0%') })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: oct(14, ': no doses due') })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: oct(17, '') })).toBeDisabled()

    const summary = screen.getByRole('region', { name: 'Month summary' })
    expect(within(summary).getByText('67%')).toBeInTheDocument()
    expect(within(summary).getByText(/2 of 3 due doses logged as taken · every dose taken on 1 of 2 days/)).toBeInTheDocument()
    expect(within(summary).getByText(/1 as-needed dose logged \(not counted in the %\)/)).toBeInTheDocument()

    await user.click(within(grid).getByRole('button', { name: oct(16, ':') }))
    const detail = screen.getByRole('region', { name: oct(16, '') })
    expect(within(detail).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '08:00 ExampleSkipped',
      '20:00 ExampleUpcoming',
      '10:00 ReliefTaken (as needed)',
    ])

    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByRole('heading', { name: /September 2026/ })).toBeInTheDocument()
    expect(await screen.findByText('No scheduled doses were due this month.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled()
  })
})

/** Matches a day label in either "October 15" or "15 October" order (locale-dependent). */
function oct(day: number, rest = ''): RegExp {
  const esc = rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(October ${day}|${day} October)${esc}`)
}
