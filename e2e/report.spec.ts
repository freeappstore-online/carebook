import { expect, importSample, navTo, open, readDownload, test } from './fixtures'

test('makes the clinician PDF for a date range and downloads it', async ({ page }) => {
  await open(page)
  await importSample(page)
  await navTo(page, 'Report')

  await page.getByRole('button', { name: 'Last 7 days' }).click()
  await expect(page.getByLabel('From')).toHaveValue('2026-10-10')
  const preview = page.getByRole('region', { name: 'Report contents' })
  await expect(preview).toContainText('2 medications')
  await expect(preview).toContainText('2 blood-pressure readings, with a table and chart')
  await expect(page.getByText(/Log and share with your clinician/)).toBeVisible()

  const download = page.getByRole('button', { name: 'Download PDF' })
  await expect(download).toBeEnabled()
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()])
  expect(file.suggestedFilename()).toBe('carebook-log-2026-10-10-to-2026-10-16.pdf')
  const bytes = readDownload(await file.path())
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(bytes.length).toBeGreaterThan(2000)
  await expect(page.getByText('Downloaded carebook-log-2026-10-10-to-2026-10-16.pdf.')).toBeVisible()
})
