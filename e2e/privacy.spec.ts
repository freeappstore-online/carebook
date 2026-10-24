import { expect, navTo, open, setPin, test } from './fixtures'

test('the privacy note discloses what the page connects to', async ({ page, hosts }) => {
  await open(page)
  await navTo(page, 'Privacy')
  const note = page.getByRole('region', { name: 'Your privacy' })
  await expect(note).toContainText('There is no Carebook account or Carebook cloud sync')
  await expect(note).toContainText('calendar app may sync events to the cloud')
  await expect(note).toContainText('api.freeappstore.online')
  await expect(note).toContainText('Log and share with your clinician')
  // The only outside host the page tried to reach is the platform's (analytics / API).
  expect([...hosts].filter((h) => h !== 'api.freeappstore.online')).toEqual([])
})

test('a PIN locks the app on load until it is entered', async ({ page }) => {
  await open(page)
  await setPin(page, '2580')
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: 'Carebook is locked' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)

  await page.getByLabel('PIN').fill('1111')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText('That PIN isn’t right. Try again.')).toBeVisible()

  await page.getByLabel('PIN').fill('2580')
  await page.getByRole('button', { name: 'Unlock' }).click()
  // Back on the screen that was open.
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy and data' })).toBeVisible()

  // The PIN itself isn't stored.
  const stored = await page.evaluate(() => localStorage.getItem('carebook:pin'))
  expect(stored).not.toContain('2580')
})
