import { useCallback, useEffect, useState } from 'react'
import { EmptyState, PageHeader } from '@freeappstore/sdk/ui'
import { useMedicationRepo } from '../meds/RepoContext'
import { type ScheduledDose, expandDoses } from '../meds/schedule'
import { FORM_LABELS, type Medication } from '../meds/types'
import { dateAt, deviceTimeZone, timeAt } from '../meds/zoned'
import { calcDayAdherence } from './adherence'
import { formatDay } from './calendar'
import { type DoseLog, type DoseStatus, SNOOZE_MINUTES, STATUS_LABELS } from './types'

export interface TodayScreenProps {
  now?: () => number
  timeZone?: () => string
  onNavigate?: (href: string) => void
}

const button = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]'
const primary = 'rounded-[var(--radius)] bg-[var(--accent-deep)] px-3 py-1.5 text-sm font-semibold text-white'

/** Re-renders once a minute so "due" and "snoozed until" stay current. */
function useMinuteTick(now: () => number) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [now])
}

export function TodayScreen({ now = Date.now, timeZone = deviceTimeZone, onNavigate }: TodayScreenProps) {
  const repo = useMedicationRepo()
  useMinuteTick(now)
  const zone = timeZone()
  const at = now()
  const today = dateAt(at, zone)

  const [meds, setMeds] = useState<Medication[] | null>(null)
  const [logs, setLogs] = useState<DoseLog[]>([])
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([repo.list(), repo.listLogs({ from: today, to: today })])
      setMeds(m)
      setLogs(l)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [repo, today])

  useEffect(() => {
    void reload()
  }, [reload])

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await run()
      await reload()
    } finally {
      setBusy(null)
    }
  }

  const byId = new Map((meds ?? []).map((m) => [m.id, m]))
  const logByKey = new Map(logs.map((l) => [l.key, l]))
  const doses = meds ? expandDoses(meds, { from: today, to: today, timeZone: zone }) : []
  const asNeeded = (meds ?? []).filter(
    (m) => m.schedule.kind === 'as-needed' && m.startDate <= today && (!m.endDate || m.endDate >= today),
  )
  const summary = calcDayAdherence(doses, logs, at)

  return (
    <>
      <PageHeader
        title="Today"
        description={`${formatDay(today)}. Log each dose as taken, skipped or snoozed, then log and share with your clinician.`}
      />

      {loadError && (
        <p role="alert" className="rounded-[var(--radius)] border border-[var(--line)] p-4 text-[var(--danger)]">
          Couldn’t open storage on this device. Private browsing can block it.
        </p>
      )}

      {meds && meds.length === 0 && (
        <EmptyState
          title="Nothing scheduled"
          message="Add your medications to log doses here."
          action={
            <a
              href="/medications"
              className={primary}
              onClick={(e) => {
                if (!onNavigate) return
                e.preventDefault()
                onNavigate('/medications')
              }}
            >
              Go to Medications
            </a>
          }
        />
      )}

      {meds && meds.length > 0 && (
        <>
          <p className="mb-4 text-[var(--ink)]" aria-live="polite">
            {summary.due + summary.upcoming === 0
              ? 'No scheduled doses today.'
              : `${summary.taken} of ${summary.due} due ${summary.due === 1 ? 'dose' : 'doses'} logged as taken` +
                (summary.upcoming > 0 ? `, ${summary.upcoming} still to come.` : '.')}
          </p>

          {doses.length > 0 && (
            <ul className="grid gap-3" aria-label="Scheduled doses">
              {doses.map((dose) => (
                <DoseRow
                  key={dose.key}
                  dose={dose}
                  med={byId.get(dose.medicationId)!}
                  log={logByKey.get(dose.key)}
                  now={at}
                  timeZone={zone}
                  busy={busy === dose.key}
                  onStatus={(status) => act(dose.key, () => repo.setStatus(dose, status))}
                  onUndo={() => act(dose.key, () => repo.clearLog(dose.key))}
                />
              ))}
            </ul>
          )}

          {asNeeded.length > 0 && (
            <section className="mt-8" aria-labelledby="as-needed-heading">
              <h2 id="as-needed-heading" className="mb-2 text-lg font-semibold text-[var(--ink)]">
                As needed
              </h2>
              <ul className="grid gap-3">
                {asNeeded.map((med) => {
                  const taken = logs.filter((l) => l.asNeeded && l.medicationId === med.id)
                  return (
                    <li key={med.id} className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <MedName med={med} />
                        <button
                          type="button"
                          className={primary}
                          disabled={busy === med.id}
                          aria-label={`Log a dose of ${med.name}`}
                          onClick={() => act(med.id, () => repo.logAsNeeded(med.id, zone))}
                        >
                          Log a dose
                        </button>
                      </div>
                      {taken.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${med.name} doses logged today`}>
                          {taken.map((log) => (
                            <li key={log.key} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                              Taken at {log.time}
                              <button
                                type="button"
                                className={button}
                                aria-label={`Undo ${med.name} at ${log.time}`}
                                onClick={() => act(log.key, () => repo.clearLog(log.key))}
                              >
                                Undo
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}

function MedName({ med }: { med: Medication }) {
  const detail = [med.strength, FORM_LABELS[med.form]].filter(Boolean).join(' · ')
  return (
    <div>
      <p className="font-semibold text-[var(--ink)]">{med.name}</p>
      <p className="text-sm text-[var(--muted)]">{detail}</p>
    </div>
  )
}

interface DoseRowProps {
  dose: ScheduledDose
  med: Medication
  log?: DoseLog
  now: number
  timeZone: string
  busy: boolean
  onStatus: (status: DoseStatus) => void
  onUndo: () => void
}

function DoseRow({ dose, med, log, now, timeZone, busy, onStatus, onUndo }: DoseRowProps) {
  const label = `${med.name} at ${dose.time}`
  // Shown when a DST gap moved the dose (02:30 on a spring-forward night is 03:30).
  const actual = timeAt(dose.at, timeZone)
  let state: string
  if (log?.status === 'snoozed' && log.snoozedUntil !== undefined && log.snoozedUntil > now) {
    state = `Snoozed until ${timeAt(log.snoozedUntil, timeZone)}`
  } else if (log) {
    state = STATUS_LABELS[log.status]
  } else {
    state = dose.at > now ? 'Upcoming' : 'Due'
  }

  return (
    <li
      className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4"
      aria-label={`${label}: ${state}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-4">
          <p className="w-14 font-semibold tabular-nums text-[var(--ink)]">
            {dose.time}
            {actual !== dose.time && <span className="block text-xs font-normal text-[var(--muted)]">({actual})</span>}
          </p>
          <MedName med={med} />
        </div>
        <p className="text-sm font-semibold text-[var(--muted)]">{state}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {log && log.status !== 'snoozed' ? (
          <button type="button" className={button} disabled={busy} onClick={onUndo} aria-label={`Undo ${label}`}>
            Undo
          </button>
        ) : (
          <>
            <button type="button" className={primary} disabled={busy} onClick={() => onStatus('taken')} aria-label={`Taken: ${label}`}>
              Taken
            </button>
            <button type="button" className={button} disabled={busy} onClick={() => onStatus('skipped')} aria-label={`Skipped: ${label}`}>
              Skipped
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => onStatus('snoozed')}
              aria-label={`Snooze ${SNOOZE_MINUTES} minutes: ${label}`}
            >
              Snooze {SNOOZE_MINUTES} min
            </button>
            {log && (
              <button type="button" className={button} disabled={busy} onClick={onUndo} aria-label={`Undo ${label}`}>
                Undo
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}
