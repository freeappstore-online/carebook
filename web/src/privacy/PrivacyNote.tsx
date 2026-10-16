// What Carebook keeps, where, and what the page talks to. Keep this accurate:
// index.html loads the platform analytics script, and the Shell offers an
// optional FreeAppStore sign-in (the SDK uploads error reports only for
// signed-in users).

export const PRIVACY_POINTS = [
  {
    title: 'Everything stays on this device',
    text: 'Your medications, dose log and readings are stored only in this browser on this device (IndexedDB). There is no Carebook account and no cloud sync. Reports and backups are made on the device and only leave it when you share or save them.',
  },
  {
    title: 'Analytics',
    text: 'The page loads the FreeAppStore analytics script from api.freeappstore.online (Cloudflare Web Analytics by default). It counts visits and which screens are opened, with details such as browser type and country. Carebook never sends it what you enter.',
  },
  {
    title: 'Optional FreeAppStore sign-in',
    text: 'The Sign in button belongs to FreeAppStore, not Carebook. Carebook doesn’t need it and never stores your health data in that account. If you do sign in, the platform receives error reports from the app (error messages and the screen they happened on), not your entries.',
  },
  {
    title: 'Not medical advice',
    text: 'Carebook is a log of what you enter. It doesn’t give medical advice, a diagnosis or dosing suggestions. Log and share with your clinician.',
  },
] as const

export function PrivacyNote() {
  return (
    <section aria-labelledby="privacy-heading" className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 id="privacy-heading" className="text-lg font-semibold text-[var(--ink)]">
        Your privacy
      </h2>
      <dl className="mt-2 grid gap-3">
        {PRIVACY_POINTS.map((p) => (
          <div key={p.title}>
            <dt className="font-semibold text-[var(--ink)]">{p.title}</dt>
            <dd className="text-[var(--muted)]">{p.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
