// Banned-phrase test (#256, #263): every piece of copy Carebook ships (string
// literals, template text and JSX text in the app's source, plus index.html,
// the web manifest and the store description) is checked for wording that
// reads as diagnosis, treatment or dosing advice.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ALLOWED_DISCLAIMERS, findBanned } from './copy'

const WEB = fileURLToPath(new URL('../..', import.meta.url))
const SRC = join(WEB, 'src')

/** App source files that ship (not tests, fixtures, test helpers or these rules, which only tests import). */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'test' || name === 'compliance' ? [] : sourceFiles(path)
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name) || name === 'fixtures.ts') return []
    return [path]
  })
}

interface Copy {
  where: string
  text: string
}

/** The user-facing text in a TS/TSX file: string literals, template text and JSX text. Comments are skipped. */
export function extractCopy(path: string, source = readFileSync(path, 'utf8')): Copy[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Copy[] = []
  const add = (node: ts.Node, text: string) => {
    const t = text.replace(/\s+/g, ' ').trim()
    if (!t) return
    const { line } = file.getLineAndCharacterOfPosition(node.getStart())
    out.push({ where: `${relative(WEB, path).split(sep).join('/')}:${line + 1}`, text: t })
  }
  const visit = (node: ts.Node) => {
    // Module names aren't copy.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text)
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node, node.text)
    else if (ts.isJsxText(node)) add(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

/** All shipped copy, including adjacent JSX text joined per element so sentences split across lines are checked whole. */
function shippedCopy(): Copy[] {
  const copy = sourceFiles().flatMap((f) => extractCopy(f))
  const html = readFileSync(join(WEB, 'index.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
  copy.push({ where: 'web/index.html', text: html.replace(/<[^>]+>/g, ' ') })
  for (const m of html.matchAll(/content="([^"]*)"/g)) copy.push({ where: 'web/index.html meta', text: m[1] })
  const manifest = JSON.parse(readFileSync(join(WEB, 'public/manifest.json'), 'utf8')) as Record<string, unknown>
  copy.push({ where: 'web/public/manifest.json', text: JSON.stringify(manifest) })
  const pkg = JSON.parse(readFileSync(join(WEB, '../package.json'), 'utf8')) as { description: string }
  copy.push({ where: 'package.json description (store listing)', text: pkg.description })
  return copy
}

describe('banned-phrase rules', () => {
  it.each([
    'This can diagnose high blood pressure',
    'Carebook helps treat hypertension',
    'Treatment options',
    'A cure for headaches',
    'The safe dose is two tablets',
    'Here is some medical advice',
    'Check your prescription',
    'Ask before you are prescribed more',
    'The recommended dose is 10 mg',
    'You should take it with food',
    'Double your dose if you miss one',
  ])('flags %j', (text) => {
    expect(findBanned(text)).not.toEqual([])
  })

  it.each([
    'It doesn’t give medical advice, a diagnosis or dosing suggestions. Log and share with your clinician.',
    "It records what you enter; it doesn't give medical advice.",
    'It is a log, not medical advice or a diagnosis.',
    'They describe a single reading and are not a diagnosis.',
    'They aren’t a diagnosis: one reading says little on its own.',
    'Not medical advice',
    'Keep it secure and accurate',
  ])('allows the disclaimer %j', (text) => {
    expect(findBanned(text)).toEqual([])
  })

  it('only allows disclaimers in their negated form', () => {
    expect(findBanned('Get medical advice here, not medical advice elsewhere')).toHaveLength(1)
    expect(findBanned('This is a diagnosis')).toHaveLength(1)
    expect(ALLOWED_DISCLAIMERS.every((r) => r.flags.includes('g'))).toBe(true)
  })

  it('reads string, template and JSX text but not comments or imports', () => {
    const copy = extractCopy(
      'x.tsx',
      `import { cure } from './treat'
      // treat this comment as not shipped
      const a = 'one'
      const b = \`two \${a} three\`
      export const C = () => <p title="four">five <b>six</b></p>`,
    ).map((c) => c.text)
    expect(copy).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
  })
})

describe('shipped copy', () => {
  const copy = shippedCopy()

  it('is found in every screen', () => {
    const files = new Set(copy.map((c) => c.where.split(':')[0]))
    for (const screen of [
      'src/App.tsx',
      'src/meds/MedicationsScreen.tsx',
      'src/meds/MedicationForm.tsx',
      'src/today/TodayScreen.tsx',
      'src/today/HistoryScreen.tsx',
      'src/vitals/VitalsScreen.tsx',
      'src/vitals/bp.ts',
      'src/report/pdf.ts',
      'src/report/ReportScreen.tsx',
      'src/privacy/PrivacyNote.tsx',
      'src/privacy/PrivacyScreen.tsx',
      'src/privacy/LockScreen.tsx',
    ]) {
      expect(files, screen).toContain(screen)
    }
    expect(copy.length).toBeGreaterThan(300)
  })

  it('has no banned phrases', () => {
    const findings = copy.flatMap((c) => findBanned(c.text).map((f) => `${c.where}: "${f.match}" (${f.phrase}) in: ${c.text}`))
    expect(findings).toEqual([])
  })

  it('says "log and share with your clinician" on every health screen', () => {
    for (const file of [
      'src/meds/MedicationsScreen.tsx',
      'src/meds/MedicationForm.tsx',
      'src/today/TodayScreen.tsx',
      'src/today/HistoryScreen.tsx',
      'src/vitals/VitalsScreen.tsx',
      'src/vitals/ReadingForm.tsx',
      'src/report/ReportScreen.tsx',
      'src/report/data.ts',
      'src/privacy/PrivacyNote.tsx',
    ]) {
      const text = copy
        .filter((c) => c.where.startsWith(`${file}:`))
        .map((c) => c.text)
        .join(' ')
      expect(text, file).toMatch(/log and share with your clinician/i)
    }
  })
})
