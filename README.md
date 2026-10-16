# Carebook

**Coming soon — a private medication and blood-pressure diary: log doses and vitals, see
trends, and share a PDF with your clinician. Everything stays on your device.** A free app on
[FreeAppStore](https://freeappstore.online), live at https://carebook.freeappstore.online.

Right now this is a shell: it lists the planned features, but none of them work yet. Progress is
tracked in
[freeappstore-online/platform#256](https://github.com/freeappstore-online/platform/issues/256).

## Develop

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # production build in web/dist
fas check     # FreeAppStore compliance checks
```

Pushes to `main` auto-deploy via GitHub Actions.

## License

MIT.
