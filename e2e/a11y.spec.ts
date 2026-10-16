import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, importSample, open, setPin, test } from './fixtures'

// Accessibility audit: axe-core (WCAG 2.0/2.1/2.2 A and AA) on every screen,
// with data loaded, and on the lock screen, in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// The top bar (logo, nav, text size, theme, Sign in) is the platform's shared
// Shell from @freeappstore/sdk, identical in every app and styled by the
// platform, so the app's audit excludes it and records its findings instead.
const PLATFORM_HEADER = 'body > div#root header'

async function audit(page: Page, label: string) {
  // Let entry animations (e.g. a dialog fading in) finish, or axe measures
  // contrast mid-fade.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const results = await new AxeBuilder({ page }).withTags(WCAG).exclude(PLATFORM_HEADER).analyze()
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  )
  expect(summary, `axe violations on ${label}`).toEqual([])
  // The lock screen has no platform header.
  if ((await page.locator(PLATFORM_HEADER).count()) === 0) return
  const header = await new AxeBuilder({ page }).withTags(WCAG).include(PLATFORM_HEADER).analyze()
  for (const v of header.violations) {
    test.info().annotations.push({ type: 'platform header', description: `${label}: ${v.id} (${v.impact})` })
  }
}

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => localStorage.setItem('stores-theme', t), theme)
}

const ROUTES: [string, string][] = [
  ['/', 'Today'],
  ['/medications', 'Medications'],
  ['/history', 'History'],
  ['/vitals', 'Vitals'],
  ['/report', 'Report'],
  ['/privacy', 'Privacy and data'],
  ['/about', 'About'],
]

for (const theme of ['light', 'dark'] as const) {
  test(`every screen has no WCAG A/AA violations (${theme})`, async ({ page }) => {
    await useTheme(page, theme)
    await open(page)
    await importSample(page)
    for (const [path, heading] of ROUTES) {
      await open(page, path)
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
      if (path === '/history') await page.getByRole('button', { name: /15 October/ }).click()
      await audit(page, `${path} ${theme}`)
    }
  })

  test(`the add forms have no WCAG A/AA violations (${theme})`, async ({ page }) => {
    await useTheme(page, theme)
    await open(page, '/medications')
    await page.getByRole('button', { name: 'Add medication' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, `medication form ${theme}`)
    await open(page, '/vitals')
    await page.getByRole('button', { name: 'Add reading' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, `reading form ${theme}`)
  })

  test(`the lock screen has no WCAG A/AA violations (${theme})`, async ({ page }) => {
    await useTheme(page, theme)
    await open(page)
    await setPin(page, '2580')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1, name: 'Carebook is locked' })).toBeVisible()
    await audit(page, `lock screen ${theme}`)
  })
}
