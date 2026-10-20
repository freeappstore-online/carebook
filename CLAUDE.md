# carebook

Carebook: a private medication and blood-pressure diary on FreeAppStore — medications and
schedules, a today view (taken/skipped/snoozed) with adherence history, BP/weight/glucose vitals
with 7/30/90-day trends, a PDF report for the clinician, JSON export/import and an optional local
PIN. Everything on the device (IndexedDB), no account. All v1 features work (carebook#1–#7),
and the app is live. Medications live in `web/src/meds` (schedule
expansion in `schedule.ts`/`zoned.ts` is DST/time-zone safe); dose logs, adherence maths and the
Today/History screens in `web/src/today`; vitals, AHA BP labels (`bp.ts`, cited on About) and SVG charts in
`web/src/vitals`; the PDF report (pdf-lib, lazy-loaded; licences in `THIRD-PARTY-LICENSES.md`) in
`web/src/report`; the privacy note, PIN lock (salted PBKDF2 hash in localStorage) and JSON backups in
`web/src/privacy`. IndexedDB `carebook` v3 (`medications`, `adherence`, `vitals`).

- Live: https://carebook.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Unit tests: `pnpm test` (typecheck + Vitest in `web/src`, incl. banned-phrase and theme checks in
  `web/src/compliance`)
- E2E: `pnpm test:e2e` (Playwright in `e2e/`, built app: flows, offline PWA, axe in both themes)
- Check: `fas check` and `fas screencheck`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Health guardrails (#256): no medical advice, diagnosis or dosing suggestions; copy says "log
  and share with your clinician". BP categories only as neutral, cited labels with a "not a
  diagnosis" note.
- The privacy note (`web/src/privacy/PrivacyNote.tsx`) lists every outside connection: keep it accurate
  if the analytics loader or SDK behaviour changes.
- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
