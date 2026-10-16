// End-to-end tests: the built app (web/dist, with its service worker) served by
// `vite preview` and driven in Chromium at a phone-sized viewport. Run with
// `pnpm test:e2e`, which builds first. Unit tests are Vitest (`pnpm test`) and
// live in web/src; this runner only looks in e2e/.

import { defineConfig, devices } from '@playwright/test'

const PORT = 4620

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    // Pixel 7 is a Chromium device; keep its size and touch, use our browser.
    browserName: 'chromium',
    // A fixed zone so dates and dose times are the same on every machine.
    timezoneId: 'Europe/London',
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --filter @carebook/web exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
