import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { MedicationsScreen } from './meds/MedicationsScreen'
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
  { label: 'About', href: '/about', title: 'About — Carebook' },
]

// The features planned for v1 (freeappstore-online/platform#256). Log-and-share
// copy only: no medical advice, diagnosis or dosing suggestions.
const FEATURES = [
  { name: 'Medications', what: 'Keep your list: name, strength, form, schedule and notes.', ready: true },
  { name: 'Today', what: 'Mark each dose taken, skipped or snoozed, with a history calendar.', ready: true },
  { name: 'Blood pressure', what: 'Log readings with pulse, arm and position, plus weight and glucose.' },
  { name: 'Trends', what: 'Charts and averages over 7, 30 and 90 days.' },
  { name: 'PDF report', what: 'Make a PDF of your log for a date range to share with your clinician.' },
  { name: 'Private', what: 'Everything stays on your device. No account; optional PIN lock.' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

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

  return (
    <Shell app={fas} appName="Carebook" nav={NAV} onNavigate={navigate}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">{screen(path, navigate)}</div>
      <BuildInfo />
    </Shell>
  )
}

function screen(path: string, navigate: (href: string) => void) {
  if (path === '/about') return <About />
  if (path === '/medications') return <MedicationsScreen />
  if (path === '/history') return <HistoryScreen />
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
        Carebook will be a simple diary for your medications and blood pressure: log and share with
        your clinician. It records what you enter; it doesn't give medical advice. Everything stays
        on your device and works offline. No account, no ads, no subscription.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        Carebook is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        .
      </p>
    </>
  )
}

// Says plainly which features work yet.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Carebook is in development: medications, today's doses and the history calendar work now; the features marked "coming soon" aren't available yet.
    </p>
  )
}
