import { expect, importSample, navTo, open, readDownload, test } from './fixtures'

// PWA offline: once the service worker has installed, the app (including the
// lazily loaded pdf-lib chunk) works with no network at all.

test('loads, works and makes a PDF offline', async ({ page, context }) => {
  await open(page)
  // Wait for the service worker to install and take control of the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    }
  })
  await importSample(page)

  await context.setOffline(true)
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Scheduled doses' })).toBeVisible()

    // A deep link that was never visited still loads (navigation fallback).
    await page.goto('/vitals', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Vitals' })).toBeVisible()
    await expect(page.getByRole('img', { name: /^Blood pressure: 2 readings/ })).toBeVisible()

    // The PDF chunk comes from the precache.
    await navTo(page, 'Report')
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download PDF' }).click(),
    ])
    expect(readDownload(await file.path()).subarray(0, 5).toString('latin1')).toBe('%PDF-')
  } finally {
    await context.setOffline(false)
  }
})
