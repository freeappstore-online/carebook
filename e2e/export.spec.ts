import { addMedication, expect, navTo, open, readDownload, test } from './fixtures'

test('exports everything as JSON and imports it back', async ({ page }) => {
  await open(page)
  await addMedication(page, 'Medication Alpha', ['08:00'], '10 mg')
  await navTo(page, 'Today')
  await page.getByRole('button', { name: 'Taken: Medication Alpha at 08:00' }).click()
  await expect(page.getByRole('listitem', { name: 'Medication Alpha at 08:00: Taken' })).toBeVisible()

  await navTo(page, 'Privacy')
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ])
  expect(file.suggestedFilename()).toBe('carebook-backup-2026-10-16.json')
  const text = readDownload(await file.path()).toString('utf8')
  const backup = JSON.parse(text)
  expect(backup).toMatchObject({
    format: 'carebook-backup',
    schemaVersion: 3,
    app: 'Carebook',
    exportedAt: '2026-10-16T09:00:00.000Z',
  })
  expect(backup.medications).toEqual([expect.objectContaining({ name: 'Medication Alpha', strength: '10 mg' })])
  expect(backup.adherence).toEqual([expect.objectContaining({ status: 'taken', time: '08:00', date: '2026-10-16' })])
  expect(backup.vitals).toEqual([])

  // Remove the medication (and its log), then restore both from the file.
  await navTo(page, 'Medications')
  await page.getByRole('button', { name: 'Remove Medication Alpha' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('No medications yet')).toBeVisible()

  await navTo(page, 'Privacy')
  await page.getByLabel('Backup file to import').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  const confirm = page.getByRole('dialog', { name: 'Replace your data with this backup?' })
  await expect(confirm).toContainText('1 medication, 1 dose log entry and 0 readings')
  await confirm.getByRole('button', { name: 'Replace and import' }).click()
  await expect(page.getByText('Imported 1 medication, 1 dose log entry and 0 readings.')).toBeVisible()

  await navTo(page, 'Today')
  await expect(page.getByRole('listitem', { name: 'Medication Alpha at 08:00: Taken' })).toBeVisible()
})

test('rejects a file that isn’t a Carebook backup', async ({ page }) => {
  await open(page)
  await navTo(page, 'Privacy')
  await page.getByLabel('Backup file to import').setInputFiles({
    name: 'x.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}'),
  })
  await expect(page.getByRole('alert')).toHaveText('This file isn’t a Carebook backup.')
})
