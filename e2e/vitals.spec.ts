import { expect, navTo, open, test } from './fixtures'

test('adds a blood-pressure reading and shows it in the chart and list', async ({ page }) => {
  await open(page)
  await navTo(page, 'Vitals')
  await page.getByRole('button', { name: 'Add reading' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add reading' })
  await expect(dialog.getByLabel('Date')).toHaveValue('2026-10-16')
  await expect(dialog.getByLabel('Time')).toHaveValue('10:00')
  await dialog.getByLabel(/Systolic/).fill('128')
  await dialog.getByLabel(/Diastolic/).fill('82')
  await dialog.getByLabel(/Pulse/).fill('64')
  await dialog.getByLabel(/Arm/).selectOption('left')
  await dialog.getByRole('button', { name: 'Save reading' }).click()

  await expect(page.getByRole('img', { name: /^Blood pressure: 1 reading, average 128\/82 mmHg/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Pulse: 1 reading, average 64 bpm/ })).toBeVisible()
  const row = page.getByRole('list', { name: 'Readings' }).getByRole('listitem')
  await expect(row).toContainText('128/82 mmHg · pulse 64 bpm')
  // A neutral, cited label and the not-a-diagnosis note; no advice.
  await expect(row).toContainText('AHA category: High blood pressure stage 1')
  await expect(page.getByText(/not a diagnosis/)).toBeVisible()
  await expect(page.locator('main')).not.toContainText(/\b(should|see a doctor|seek|emergency)\b/i)

  await page.getByRole('button', { name: '7 days' }).click()
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Averages' })).toContainText('128/82')
})
