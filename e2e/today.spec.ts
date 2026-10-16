import { addMedication, expect, navTo, open, test } from './fixtures'

test('marks a dose taken and the adherence updates', async ({ page }) => {
  await open(page)
  // At 10:00, 08:00 is due and 20:00 is still to come.
  await addMedication(page, 'Medication Alpha', ['08:00', '20:00'])
  await navTo(page, 'Today')

  const doses = page.getByRole('list', { name: 'Scheduled doses' })
  await expect(doses.getByRole('listitem', { name: 'Medication Alpha at 08:00: Due' })).toBeVisible()
  await expect(doses.getByRole('listitem', { name: 'Medication Alpha at 20:00: Upcoming' })).toBeVisible()
  await expect(page.getByText('0 of 1 due dose logged as taken, 1 still to come.')).toBeVisible()

  await page.getByRole('button', { name: 'Taken: Medication Alpha at 08:00' }).click()
  await expect(doses.getByRole('listitem', { name: 'Medication Alpha at 08:00: Taken' })).toBeVisible()
  await expect(page.getByText('1 of 1 due dose logged as taken, 1 still to come.')).toBeVisible()

  await page.getByRole('button', { name: 'Snooze 15 min: Medication Alpha at 20:00' }).click()
  await expect(doses.getByRole('listitem', { name: 'Medication Alpha at 20:00: Snoozed until 10:15' })).toBeVisible()

  // The history calendar shows today's adherence: 1 taken of 2 due (the snoozed one counts as not taken).
  await navTo(page, 'History')
  await expect(page.getByRole('heading', { level: 2, name: 'October 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: /16 October: 1 of 2 taken, 50%/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Month summary' })).toContainText('50%')
})
