import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { MedicationsScreen } from './meds/MedicationsScreen'
import { medicationRepo } from './meds/repository'
import { LockScreen } from './privacy/LockScreen'
import { clearPin, hasPin } from './privacy/pin'
import { PrivacyScreen } from './privacy/PrivacyScreen'
import { ReportScreen } from './report/ReportScreen'
import { BP_CATEGORIES, BP_CATEGORY_LABELS, BP_CATEGORY_RANGES, BP_SOURCE } from './vitals/bp'
import { VitalsScreen } from './vitals/VitalsScreen'
import { HistoryScreen } from './today/HistoryScreen'
import { TodayScreen } from './today/TodayScreen'

const fas = initApp({ appId: 'carebook' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Today', href: '/', title: 'Carebook' },
  { label: 'Medications', href: '/medications', title: 'Medications — Carebook' },
  { label: 'History', href: '/history', title: 'History — Carebook' },
  { label: 'Vitals', href: '/vitals', title: 'Vitals — Carebook' },
  { label: 'Report', href: '/report', title: 'Report — Carebook' },
  { label: 'Privacy', href: '/privacy', title: 'Privacy and data — Carebook' },
  { label: 'About', href: '/about', title: 'About — Carebook' },
]

// The features planned for v1 (freeappstore-online/platform#256). Log-and-share
// copy only: no medical advice, diagnosis or dosing suggestions.
const FEATURES = [
  { name: 'Medications', what: 'Keep your list: name, strength, form, schedule and notes.', ready: true },
  { name: 'Today', what: 'Mark each dose taken, skipped or snoozed, with a history calendar.', ready: true },
  { name: 'Blood pressure', what: 'Log readings with pulse, arm and position, plus weight and glucose.', ready: true },
  { name: 'Trends', what: 'Charts and averages over 7, 30 and 90 days.', ready: true },
  { name: 'PDF report', what: 'Make a PDF of your log for a date range to share with your clinician.', ready: true },
  { name: 'Private', what: 'Everything stays on your device. No account; optional PIN lock and JSON backups.', ready: true },
]

/** With a PIN set, the app locks again after this long in the background. */
const RELOCK_AFTER_MS = 5 * 60_000

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)
  // With a PIN set, nothing but the lock screen renders until it's entered.
  const [locked, setLocked] = useState(() => hasPin())

  useEffect(() => {
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER_MS && hasPin()) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  if (locked) {
    return (
      <LockScreen
        onUnlock={() => setLocked(false)}
        onErase={async () => {
          await medicationRepo.eraseAll()
          clearPin()
          setLocked(false)
        }}
      />
    )
  }

  return (
    <Shell app={fas} appName="Carebook" nav={NAV} onNavigate={navigate}>
      {/* Each screen scrolls inside the app frame; the page itself never does. */}
      <div className="cb-page">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">{screen(path, navigate, () => setLocked(true))}</div>
        <BuildInfo />
      </div>
    </Shell>
  )
}

function screen(path: string, navigate: (href: string) => void, lock: () => void) {
  if (path === '/about') return <About />
  if (path === '/privacy') return <PrivacyScreen onLock={lock} />
  if (path === '/medications') return <MedicationsScreen />
  if (path === '/history') return <HistoryScreen />
  if (path === '/vitals') return <VitalsScreen />
  if (path === '/report') return <ReportScreen />
  return <TodayScreen onNavigate={navigate} />
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <ComingSoon />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">
              {feature.name}
              {!('ready' in feature) && <span className="font-normal text-[var(--muted)]"> · coming soon</span>}
            </p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[var(--muted)]">
        Carebook is a simple diary for your medications and blood pressure: log and share with
        your clinician. It records what you enter; it doesn't give medical advice. Everything stays
        on your device and works offline. No account, no ads, no subscription. See Privacy and data for
        what the page connects to, the optional PIN lock and backups.
      </p>
      <BpCategories />
      <p className="mt-4 text-[var(--muted)]">
        Carebook is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        . The PDF report is made on your device with pdf-lib (MIT licence, © 2019 Andrew Dillon); see
        THIRD-PARTY-LICENSES.md in the source for its licence and those of its dependencies.
      </p>
    </>
  )
}

// The source of the blood-pressure category names shown on Vitals (#256: neutral, cited, not a diagnosis).
function BpCategories() {
  return (
    <section className="mt-6" aria-labelledby="bp-categories">
      <h2 id="bp-categories" className="text-lg font-semibold text-[var(--ink)]">
        Blood-pressure categories
      </h2>
      <p className="mt-2 text-[var(--muted)]">
        Next to each blood-pressure reading, Carebook shows the category name for that single reading from the{' '}
        <a href={BP_SOURCE.url} className="underline" rel="noreferrer" target="_blank">
          {BP_SOURCE.title}
        </a>
        , which follows the {BP_SOURCE.guideline}. The names are shown as plain text, without colours or alerts. They
        aren’t a diagnosis: one reading says little on its own. Log and share with your clinician.
      </p>
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="text-[var(--muted)]">
            <th scope="col" className="py-1 pr-4 font-semibold">
              Category (AHA)
            </th>
            <th scope="col" className="py-1 font-semibold">
              Reading (mmHg)
            </th>
          </tr>
        </thead>
        <tbody>
          {BP_CATEGORIES.map((c) => (
            <tr key={c} className="border-t border-[var(--line)] text-[var(--ink)]">
              <td className="py-1 pr-4">{BP_CATEGORY_LABELS[c]}</td>
              <td className="py-1">{BP_CATEGORY_RANGES[c]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// Says plainly which features work yet.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Carebook is in development ahead of its first release. All the features below work now.
    </p>
  )
}
