import { useEffect, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { useMedicationRepo } from '../meds/RepoContext'
import { addDays, dateAt, deviceTimeZone } from '../meds/zoned'
import { REPORT_DISCLAIMER, type ReportData, buildReportData, checkRange, reportFileName } from './data'
import { type ShareOutcome, canSharePdf, downloadPdf, shareOrDownloadPdf } from './share'

export interface ReportScreenProps {
  now?: () => number
  timeZone?: () => string
  /** Builds the PDF; defaults to loading pdf-lib on demand so it isn't in the main bundle. */
  render?: (data: ReportData) => Promise<Uint8Array>
}

const loadRenderer = async (data: ReportData) => (await import('./pdf')).renderReportPdf(data)

const field = 'mt-1 w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'
const label = 'block text-sm font-semibold text-[var(--ink)]'
const primary = 'rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2 font-semibold text-[var(--paper)] disabled:opacity-60'
const quiet = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2 text-[var(--ink)] disabled:opacity-60'

const PRESETS = [7, 30, 90] as const

export function ReportScreen({ now = Date.now, timeZone = deviceTimeZone, render = loadRenderer }: ReportScreenProps) {
  const repo = useMedicationRepo()
  const zone = timeZone()
  const today = dateAt(now(), zone)
  const [from, setFrom] = useState(() => addDays(today, -29))
  const [to, setTo] = useState(today)
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const canShare = canSharePdf()

  const rangeProblem = checkRange({ from, to })

  useEffect(() => {
    if (rangeProblem) {
      setData(null)
      return
    }
    let live = true
    void (async () => {
      try {
        const [medications, logs, readings] = await Promise.all([
          repo.list(),
          repo.listLogs({ from, to }),
          repo.listReadings({ from, to }),
        ])
        if (!live) return
        setData(buildReportData({ range: { from, to }, timeZone: zone, now: now(), medications, logs, readings }))
        setError(null)
      } catch {
        if (live) setError('Couldn’t open storage on this device. Private browsing can block it.')
      }
    })()
    return () => {
      live = false
    }
    // `now` is read when the range changes, not on every tick, so it isn't a dependency.
  }, [repo, from, to, zone, rangeProblem])

  const make = async (mode: 'share' | 'download') => {
    if (!data) return
    setBusy(true)
    setStatus(null)
    try {
      const bytes = await render(data)
      const name = reportFileName(data.range)
      let outcome: ShareOutcome
      if (mode === 'share') outcome = await shareOrDownloadPdf(bytes, name)
      else {
        downloadPdf(bytes, name)
        outcome = 'downloaded'
      }
      setStatus(
        outcome === 'shared' ? 'Report shared.' : outcome === 'cancelled' ? 'Sharing cancelled.' : `Downloaded ${name}.`,
      )
    } catch {
      setStatus('Couldn’t make the PDF. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const preset = (days: number) => {
    setFrom(addDays(today, -(days - 1)))
    setTo(today)
  }

  const bpCount = data?.bp.length ?? 0
  const a = data?.adherence

  return (
    <>
      <PageHeader
        title="Report"
        description="Make a PDF of your log for a date range, to share with your clinician. It's made on this device."
      />

      <fieldset className="grid gap-4">
        <legend className="sr-only">Date range</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick ranges">
          {PRESETS.map((d) => (
            <button key={d} type="button" className="rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]" onClick={() => preset(d)}>
              Last {d} days
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="report-from">
              From
            </label>
            <input id="report-from" type="date" className={field} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="report-to">
              To
            </label>
            <input id="report-to" type="date" className={field} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {rangeProblem && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {rangeProblem}
          </p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="mt-4 text-[var(--danger)]">
          {error}
        </p>
      )}

      {data && (
        <section aria-label="Report contents" className="mt-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="font-semibold text-[var(--ink)]">The PDF will include</p>
          <ul className="mt-2 list-disc pl-5 text-[var(--ink)]">
            <li>
              {data.medications.length} {data.medications.length === 1 ? 'medication' : 'medications'}
            </li>
            <li>
              {a && a.due > 0
                ? `Adherence ${a.percent}%: ${a.taken} of ${a.due} due doses logged as taken`
                : 'Adherence: no scheduled doses were due'}
            </li>
            <li>
              {bpCount} blood-pressure {bpCount === 1 ? 'reading' : 'readings'}
              {bpCount > 0 ? ', with a table and chart' : ''}
            </li>
            {data.other.length > 0 && <li>{data.other.length} pulse, weight or glucose readings</li>}
          </ul>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canShare && (
          <button type="button" className={primary} disabled={!data || busy} onClick={() => void make('share')}>
            Share PDF
          </button>
        )}
        <button type="button" className={canShare ? quiet : primary} disabled={!data || busy} onClick={() => void make('download')}>
          Download PDF
        </button>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]" aria-live="polite">
        {busy ? 'Making the PDF…' : status}
      </p>

      <p className="mt-6 text-sm text-[var(--muted)]">
        {REPORT_DISCLAIMER} Log and share with your clinician. Sharing goes through your device’s share sheet; Carebook
        doesn’t upload the report anywhere.
      </p>
    </>
  )
}
