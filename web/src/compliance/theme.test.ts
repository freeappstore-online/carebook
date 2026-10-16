// Light and dark themes (#263): every CSS variable the app's screens use is
// defined, colour variables have a dark-theme value too, the theme follows the
// system setting at load, and the main text/background pairs meet WCAG AA.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WEB = fileURLToPath(new URL('../..', import.meta.url))
const css = readFileSync(join(WEB, 'src/index.css'), 'utf8')
const html = readFileSync(join(WEB, 'index.html'), 'utf8')

function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`No ${selector} block in index.css`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const vars = new Map<string, string>()
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(m[1], m[2].trim())
  return vars
}

const light = block(':root')
const dark = block(":root[data-theme='dark']")

function appFiles(dir = join(WEB, 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' || name === 'compliance' ? [] : appFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const used = new Set(appFiles().flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1])))
const isColour = (v: string) => /^(#|rgba?\(|hsla?\(|linear-gradient)/.test(v)

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('themes', () => {
  it('finds the variables the screens use', () => {
    for (const v of ['--ink', '--paper', '--muted', '--line', '--panel', '--danger', '--radius']) expect(used).toContain(v)
  })

  it('defines every variable the app uses', () => {
    const missing = [...used].filter((v) => !light.has(v))
    expect(missing).toEqual([])
  })

  it('gives every colour variable the app uses a dark-theme value', () => {
    const missing = [...used].filter((v) => isColour(light.get(v) ?? '') && !dark.has(v))
    expect(missing).toEqual([])
  })

  it('sets color-scheme for both themes', () => {
    expect(css).toMatch(/:root \{\s*color-scheme: light;/)
    expect(css).toMatch(/:root\[data-theme='dark'\] \{\s*color-scheme: dark;/)
  })

  it('applies the dark theme from the saved choice or the system setting before first paint', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain("localStorage.getItem('stores-theme')")
    expect(head).toContain("matchMedia('(prefers-color-scheme: dark)')")
    expect(head).toContain("document.documentElement.dataset.theme = 'dark'")
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('meets WCAG AA contrast for text in the %s theme', (_, theme) => {
    const v = (name: string) => theme.get(name)!
    // Body text, secondary text, error text, and primary buttons (paper on ink).
    expect(contrast(v('--ink'), v('--paper'))).toBeGreaterThanOrEqual(7)
    expect(contrast(v('--muted'), v('--paper'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(v('--danger'), v('--paper'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(v('--paper'), v('--ink'))).toBeGreaterThanOrEqual(7)
    // Chart lines against the page (non-text graphics: 3:1).
    for (const line of ['--accent-deep', '--sky-deep', '--mint-deep']) {
      expect(contrast(v(line), v('--paper')), line).toBeGreaterThanOrEqual(3)
    }
  })

  it('computes contrast like WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
})
