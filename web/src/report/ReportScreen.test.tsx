// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MedicationRepoContext } from '../meds/RepoContext'
import { type MedicationRepository, createMedicationRepository } from '../meds/repository'
import { doseKey } from '../meds/schedule'
import { pdfText } from '../test/pdfText'
import type { ReportData } from './data'
import { renderReportPdf } from './pdf'
import { ReportScreen } from './ReportScreen'

let dbCount = 0
const repos: MedicationRepository[] = []
const TZ = 'Europe/London'
const NOW = Date.parse('2026-10-16T11:00:00Z')

let downloads: HTMLAnchorElement[] = []
let blobs: Blob[] = []

beforeEach(() => {
  downloads = []
  blobs = []
  URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b)
    return 'blob:report'
  })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this)
  })
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await Promise.all(repos.splice(0).map((r) => r.close()))
})

async function setup(render_ = renderReportPdf) {
  const repo = createMedicationRepository({ dbName: `report-${++dbCount}` })
  repos.push(repo)
  const med = await repo.save({
    name: 'Medication Alpha',
    strength: '10 mg',
    form: 'tablet',
    schedule: { kind: 'daily', times: ['08:00'] },
    startDate: '2026-10-14',
    notes: '',
  })
  for (const date of ['2026-10-14', '2026-10-15']) {
    await repo.setStatus({ key: doseKey(med.id, date, '08:00'), medicationId: med.id, date, time: '08:00' }, 'taken')
  }
  await repo.saveReading({ date: '2026-10-15', time: '07:30', systolic: 124, diastolic: 78, pulse: 61 }, TZ)
  render(
    <MedicationRepoContext.Provider value={repo}>
      <ReportScreen now={() => NOW} timeZone={() => TZ} render={render_} />
    </MedicationRepoContext.Provider>,
  )
  return userEvent.setup()
}

describe('ReportScreen', () => {
  it('previews the last 30 days and downloads the PDF', async () => {
    const user = await setup()
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-17')
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-16')
    expect(screen.getByText(/Log and share with your clinician/)).toBeInTheDocument()

    const preview = await screen.findByRole('region', { name: 'Report contents' })
    // 14, 15 and 16 Oct at 08:00 are due; two were taken.
    expect(within(preview).getByText('Adherence 67%: 2 of 3 due doses logged as taken')).toBeInTheDocument()
    expect(within(preview).getByText(/1 blood-pressure reading, with a table and chart/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(await screen.findByText('Downloaded carebook-log-2026-09-17-to-2026-10-16.pdf.')).toBeInTheDocument()
    expect(downloads).toHaveLength(1)
    expect(downloads[0].download).toBe('carebook-log-2026-09-17-to-2026-10-16.pdf')

    const bytes = new Uint8Array(await blobs[0].arrayBuffer())
    const text = (await pdfText(bytes)).replace(/\n/g, ' ')
    expect(text).toContain('Medication Alpha')
    expect(text).toContain('Adherence: 67% (2 of 3 due doses logged as taken')
    expect(text).toContain('124/78')
    expect(text).toContain('Log and share with your clinician')
  })

  it('uses the chosen range and rejects a reversed one', async () => {
    const seen: ReportData[] = []
    const user = await setup(async (data) => {
      seen.push(data)
      return new Uint8Array([37, 80, 68, 70])
    })
    await user.click(await screen.findByRole('button', { name: 'Last 7 days' }))
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-10')

    const to = screen.getByLabelText('To')
    await user.clear(to)
    await user.type(to, '2026-10-01')
    expect(await screen.findByRole('alert')).toHaveTextContent('The end date is before the start date')
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled()

    await user.clear(to)
    await user.type(to, '2026-10-14')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDF' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].range).toEqual({ from: '2026-10-10', to: '2026-10-14' })
    expect(seen[0].bp).toHaveLength(0)
  })
})
