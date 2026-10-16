# carebook

Carebook: a private medication and blood-pressure diary on FreeAppStore — medications and
schedules, a today view (taken/skipped/snoozed) with adherence history, BP/weight/glucose vitals
with 7/30/90-day trends, a PDF report for the clinician, JSON export/import and an optional local
PIN. Everything on the device (IndexedDB), no account. In progress: Today, Medications, History, Vitals, Report and
About work; the rest is "coming soon" (freeappstore-online/platform#256). Medications live in `web/src/meds` (schedule
expansion in `schedule.ts`/`zoned.ts` is DST/time-zone safe); dose logs, adherence maths and the
Today/History screens in `web/src/today`; vitals, AHA BP labels (`bp.ts`, cited on About) and SVG charts in
`web/src/vitals`; the PDF report (pdf-lib, lazy-loaded; licences in `THIRD-PARTY-LICENSES.md`) in
`web/src/report`. IndexedDB `carebook` v3 (`medications`, `adherence`, `vitals`). Tests: `pnpm test`.

- Live: https://carebook.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Health guardrails (#256): no medical advice, diagnosis or dosing suggestions; copy says "log
  and share with your clinician". BP categories only as neutral, cited labels with a "not a
  diagnosis" note.
- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
