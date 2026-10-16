// Shared e2e setup.
//
// - Requests leaving localhost are blocked, so runs never depend on (or touch)
//   the live platform API or analytics. Every host the page tries to reach is
//   still recorded in `hosts`.
// - The clock is fixed at NOW (Friday 16 October 2026, 10:00 in London; the
//   config sets the zone), so dose times and dates are the same on every run.
// - Any uncaught page error fails the test.

import { readFileSync } from 'node:fs'
import { test as base, expect, type Page } from '@playwright/test'

export const NOW = new Date('2026-10-16T09:00:00Z') // 10:00 BST
export const TODAY = '2026-10-16'

export const test = base.extend<{ pageErrors: string[]; hosts: Set<string> }>({
  hosts: async ({ context }, use) => {
    const hosts = new Set<string>()
    await context.route(
      (url) => url.protocol.startsWith('http') && url.hostname !== 'localhost',
      (route) => {
        hosts.add(new URL(route.request().url()).hostname)
        return route.abort()
      },
    )
    await use(hosts)
  },
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(NOW)
    await use(page)
  },
  pageErrors: [
    async ({ page, hosts }, use) => {
      void hosts // install the request blocker for every test
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      expect(errors, 'uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Open a screen and wait for the app to settle. */
export async function open(page: Page, path = '/') {
  await page.goto(path, { waitUntil: 'networkidle' })
}

export const SCREENS = {
  Today: 'Today',
  Medications: 'Medications',
  History: 'History',
  Vitals: 'Vitals',
  Report: 'Report',
  Privacy: 'Privacy and data',
  About: 'About',
} as const

/** Go to another screen through the app's own nav. On phones the nav sits behind the Menu button. */
export async function navTo(page: Page, name: keyof typeof SCREENS) {
  const nav = page.getByRole('navigation', { name: 'Main' })
  const link = nav.getByRole('link', { name, exact: true })
  if (!(await link.isVisible())) await nav.getByRole('button', { name: 'Menu' }).click()
  await link.click()
  await expect(page.getByRole('heading', { level: 1, name: SCREENS[name], exact: true })).toBeVisible()
}

/** Add a medication through the form on the Medications screen. */
export async function addMedication(page: Page, name: string, times: string[], strength = '') {
  await navTo(page, 'Medications')
  await page.getByRole('button', { name: 'Add medication' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add medication' })
  await dialog.getByLabel('Name').fill(name)
  if (strength) await dialog.getByLabel(/^Strength/).fill(strength)
  for (const [i, time] of times.entries()) {
    if (i > 0) await dialog.getByRole('button', { name: 'Add a time' }).click()
    await dialog.getByLabel(`Time ${i + 1}`, { exact: true }).fill(time)
  }
  await dialog.getByRole('button', { name: 'Add medication' }).click()
  await expect(dialog).toBeHidden()
}

/** A backup with a week of history: one daily medication, one as-needed, dose logs and readings. */
export function sampleBackup() {
  const key = (date: string, time: string) => `med-a|${date}|${time}`
  const log = (date: string, time: string, status: 'taken' | 'skipped') => ({
    key: key(date, time),
    medicationId: 'med-a',
    date,
    time,
    status,
    loggedAt: Date.parse(`${date}T${time}:00Z`),
  })
  const reading = (id: string, date: string, time: string, systolic: number, diastolic: number, pulse: number) => ({
    id,
    date,
    time,
    takenAt: Date.parse(`${date}T${time}:00Z`) - 3_600_000,
    systolic,
    diastolic,
    pulse,
    arm: 'left',
    position: 'sitting',
    notes: '',
    createdAt: 0,
    updatedAt: 0,
  })
  return {
    format: 'carebook-backup',
    schemaVersion: 3,
    exportedAt: '2026-10-16T08:00:00.000Z',
    app: 'Carebook',
    note: '',
    medications: [
      {
        id: 'med-a',
        name: 'Medication Alpha',
        strength: '10 mg',
        form: 'tablet',
        schedule: { kind: 'daily', times: ['08:00', '20:00'] },
        startDate: '2026-10-10',
        notes: 'With breakfast',
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'med-b',
        name: 'Medication Beta',
        strength: '',
        form: 'inhaler',
        schedule: { kind: 'as-needed' },
        startDate: '2026-10-10',
        notes: '',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    adherence: [
      log('2026-10-14', '08:00', 'taken'),
      log('2026-10-14', '20:00', 'taken'),
      log('2026-10-15', '08:00', 'taken'),
      log('2026-10-15', '20:00', 'skipped'),
    ],
    vitals: [
      reading('r1', '2026-10-13', '07:30', 118, 76, 62),
      reading('r2', '2026-10-15', '07:45', 134, 86, 70),
    ],
  }
}

/** Load the sample backup through the Privacy screen's import. */
export async function importSample(page: Page) {
  await navTo(page, 'Privacy')
  await page.getByLabel('Backup file to import').setInputFiles({
    name: 'sample.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(sampleBackup())),
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Replace and import' }).click()
  await expect(page.getByText(/^Imported 2 medications/)).toBeVisible()
}

/** Set a PIN on the Privacy screen. */
export async function setPin(page: Page, pin: string) {
  await navTo(page, 'Privacy')
  await page.getByRole('button', { name: 'Set a PIN' }).click()
  await page.getByLabel(/^PIN \(4 to 8 digits\)/).fill(pin)
  await page.getByLabel('Type it again').fill(pin)
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByText(/^PIN set/)).toBeVisible()
}

export const readDownload = (path: string) => readFileSync(path)
