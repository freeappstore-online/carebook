# Carebook

**a private medication and blood-pressure diary: log doses and vitals, see
trends, and share a PDF with your clinician. Everything stays on your device.** A free app on
[FreeAppStore](https://freeappstore.online), live at https://carebook.freeappstore.online.

Carebook keeps medication schedules, dose logs and vitals in this browser's IndexedDB. The
Medications screen lets you add, edit and remove medicines with a name, strength, form, daily,
weekly or as-needed schedule, and notes. The Vitals screen lets you record blood pressure,
pulse, arm, position, weight and glucose, then review readings and 7/30/90-day trends.
Today and History track doses; Report makes a PDF on the device to share with a clinician.
Privacy and data offers JSON export/import and an optional local PIN lock. There is no account
or cloud sync. See the in-app privacy note for the platform analytics disclosure.

The v1 work is tracked in [carebook#1](https://github.com/freeappstore-online/carebook/issues/1)
and its completed follow-up issues [#2–#7](https://github.com/freeappstore-online/carebook/issues).

## Develop

```bash
pnpm install
pnpm dev      # local dev server
pnpm test     # typecheck and unit tests
pnpm test:e2e # build and browser tests
pnpm build    # production build in web/dist
fas check     # FreeAppStore compliance checks
```

Pushes to `main` auto-deploy via GitHub Actions.

## License

MIT.
