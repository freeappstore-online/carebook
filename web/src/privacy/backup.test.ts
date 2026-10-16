import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { type MedicationRepository, SCHEMA_VERSION, createMedicationRepository } from '../meds/repository'
import { LOGS, MEDS, READINGS } from '../report/fixtures'
import { BACKUP_FORMAT, type BackupData, buildBackup, describeBackup, parseBackup } from './backup'

const DATA: BackupData = { medications: MEDS, adherence: LOGS, vitals: READINGS }
const NOW = Date.parse('2026-10-16T11:00:00Z')
const json = (v: unknown) => JSON.stringify(v)

let dbCount = 0
const repos: MedicationRepository[] = []
const makeRepo = () => {
  const repo = createMedicationRepository({ dbName: `backup-${++dbCount}` })
  repos.push(repo)
  return repo
}
afterEach(async () => {
  await Promise.all(repos.splice(0).map((r) => r.close()))
})

describe('export', () => {
  it('has the format, version, timestamp and every store', () => {
    const backup = buildBackup(DATA, NOW)
    expect(Object.keys(backup).sort()).toEqual(
      ['adherence', 'app', 'exportedAt', 'format', 'medications', 'note', 'schemaVersion', 'vitals'].sort(),
    )
    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      app: 'Carebook',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-16T11:00:00.000Z',
    })
    expect(backup.note).toMatch(/keep it somewhere private/)
    expect(backup.medications).toHaveLength(3)
    expect(backup.adherence).toHaveLength(LOGS.length)
    expect(backup.vitals).toHaveLength(READINGS.length)
  })

  it('exports everything in the database', async () => {
    const repo = makeRepo()
    await repo.replaceAll(DATA)
    const backup = buildBackup(await repo.exportAll(), NOW)
    expect(backup.medications.map((m) => m.id).sort()).toEqual(['alpha', 'beta', 'old'])
    expect(backup.adherence.map((l) => l.key).sort()).toEqual(LOGS.map((l) => l.key).sort())
    expect(backup.vitals.map((r) => r.id).sort()).toEqual(READINGS.map((r) => r.id).sort())
  })
})

describe('import', () => {
  it('round-trips an export exactly', async () => {
    const source = makeRepo()
    await source.replaceAll(DATA)
    const text = json(buildBackup(await source.exportAll(), NOW))

    const { backup, warnings } = parseBackup(text)
    expect(warnings).toEqual([])
    const target = makeRepo()
    await target.saveReading({ date: '2026-01-01', time: '08:00', pulse: 99 }, 'UTC') // replaced
    await target.replaceAll(backup)

    const sort = <T>(xs: T[], k: (x: T) => string) => [...xs].sort((a, b) => k(a).localeCompare(k(b)))
    const after = await target.exportAll()
    expect(sort(after.medications, (m) => m.id)).toEqual(sort(DATA.medications, (m) => m.id))
    expect(sort(after.adherence, (l) => l.key)).toEqual(sort(DATA.adherence, (l) => l.key))
    expect(sort(after.vitals, (r) => r.id)).toEqual(sort(DATA.vitals, (r) => r.id))
    expect(describeBackup(backup)).toBe(`3 medications, ${LOGS.length} dose log entries and ${READINGS.length} readings`)
  })

  it('rejects text that isn’t JSON, or isn’t a Carebook backup', () => {
    expect(() => parseBackup('{oops')).toThrow(/isn’t valid JSON/)
    expect(() => parseBackup('[]')).toThrow(/isn’t a Carebook backup/)
    expect(() => parseBackup(json({ format: 'other-app', schemaVersion: 1 }))).toThrow(/isn’t a Carebook backup/)
    expect(() => parseBackup(json({ format: BACKUP_FORMAT }))).toThrow(/version number/)
  })

  it('refuses a backup from a newer version', () => {
    const newer = { ...buildBackup(DATA, NOW), schemaVersion: SCHEMA_VERSION + 1 }
    expect(() => parseBackup(json(newer))).toThrow(/newer version of Carebook/)
  })

  it('warns about a backup from an older version and imports what it has', () => {
    const v1 = { format: BACKUP_FORMAT, schemaVersion: 1, exportedAt: '2026-01-01T00:00:00Z', medications: MEDS }
    const { backup, warnings } = parseBackup(json(v1))
    expect(warnings).toEqual([expect.stringMatching(/older version of Carebook \(data version 1; this one uses 3\)/)])
    expect(backup).toMatchObject({ schemaVersion: 1, adherence: [], vitals: [] })
    expect(backup.medications).toHaveLength(3)
  })

  it('rejects damaged records, naming which one', () => {
    const base = buildBackup(DATA, NOW)
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ medications: 'nope' }, /medications list/],
      [{ vitals: undefined }, /readings list/],
      [{ medications: [{ ...MEDS[0], id: '' }] }, /Medication 1 has no id/],
      [{ medications: [MEDS[0], { ...MEDS[1], schedule: { kind: 'monthly' } }] }, /Medication 2: Choose a schedule/],
      [{ adherence: [{ ...LOGS[0], status: 'forgot' }] }, /Dose log 1 has an unknown status/],
      [{ adherence: [{ ...LOGS[0], date: '2026-02-31' }] }, /Dose log 1 has an invalid date/],
      [{ vitals: [{ ...READINGS[0], systolic: 900 }] }, /Reading 1: Systolic must be between/],
      [{ vitals: [{ ...READINGS[0], takenAt: 'yesterday' }] }, /Reading 1 has damaged timestamps/],
      [{ medications: [MEDS[0], MEDS[0]] }, /two medications with the same id/],
    ]
    for (const [patch, message] of cases) {
      expect(() => parseBackup(json({ ...base, ...patch })), String(message)).toThrow(message)
    }
  })

  it('skips dose logs whose medication isn’t in the backup, with a warning', () => {
    const backup = { ...buildBackup(DATA, NOW), medications: MEDS.filter((m) => m.id !== 'alpha') }
    const parsed = parseBackup(json(backup))
    expect(parsed.backup.adherence.map((l) => l.medicationId)).toEqual(['beta'])
    expect(parsed.warnings).toEqual([`${LOGS.length - 1} dose logs belong to a medication that isn’t in the backup and will be skipped.`])
  })

  it('leaves the device unchanged when an import fails part-way', async () => {
    const repo = makeRepo()
    await repo.replaceAll(DATA)
    const broken = { ...DATA, vitals: [...READINGS, { ...READINGS[0], id: undefined as unknown as string }] }
    await expect(repo.replaceAll(broken)).rejects.toThrow()
    const after = await repo.exportAll()
    expect(after.medications).toHaveLength(3)
    expect(after.vitals).toHaveLength(READINGS.length)
  })

  it('erases everything', async () => {
    const repo = makeRepo()
    await repo.replaceAll(DATA)
    await repo.eraseAll()
    expect(await repo.exportAll()).toEqual({ medications: [], adherence: [], vitals: [] })
  })
})
