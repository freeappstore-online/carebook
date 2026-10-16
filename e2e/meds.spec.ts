import { addMedication, expect, open, test } from './fixtures'

test('adds a medication and lists it with its schedule', async ({ page }) => {
  await open(page)
  await addMedication(page, 'Medication Alpha', ['08:00', '20:00'], '10 mg')

  const list = page.getByRole('list', { name: 'Medications' })
  await expect(list.getByRole('heading', { name: 'Medication Alpha' })).toBeVisible()
  await expect(list.getByText('10 mg · Tablet')).toBeVisible()
  await expect(list.getByText('Every day at 08:00 and 20:00')).toBeVisible()
  // 10:00 now, so the next dose is this evening.
  await expect(list.getByText('Next: today at 20:00')).toBeVisible()

  // It's kept on the device across a reload.
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Medication Alpha' })).toBeVisible()
})

test('edits and removes a medication', async ({ page }) => {
  await open(page)
  await addMedication(page, 'Medication Alpha', ['08:00'])
  await page.getByRole('button', { name: 'Edit Medication Alpha' }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit medication' })
  await dialog.getByLabel('As needed').check()
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('list', { name: 'Medications' }).getByText('As needed')).toBeVisible()

  await page.getByRole('button', { name: 'Remove Medication Alpha' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('No medications yet')).toBeVisible()
})
