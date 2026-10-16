import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import { asNeededKey, SNOOZE_MINUTES } from '../today/types'
import { type MedicationRepository, type RepositoryOptions, SCHEMA_VERSION, createMedicationRepository } from './repository'
import { doseKey } from './schedule'
import type { MedicationInput } from './types'
import { normalizeMedicationInput } from './validate'

let dbCount = 0
const open: MedicationRepository[] = []

function makeRepo(options: RepositoryOptions = {}) {
  let id = 0
  const repo = createMedicationRepository({ dbName: `test-${++dbCount}`, newId: () => `id-${++id}`, ...options })
  open.push(repo)
  return repo
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((r) => r.close()))
})

const input = (extra: Partial<MedicationInput> = {}): MedicationInput => ({
  name: 'Example',
  strength: '10 mg',
  form: 'tablet',
  schedule: { kind: 'daily', times: ['08:00'] },
  startDate: '2026-10-01',
  notes: '',
  ...extra,
})

describe('medication repository', () => {
  it('creates, reads, updates and removes a medication', async () => {
    let clock = 1000
    const repo = makeRepo({ now: () => clock })
    const saved = await repo.save(input({ name: '  Example  ', notes: ' with food ' }))
    expect(saved).toEqual({
      id: 'id-1',
      name: 'Example',
      strength: '10 mg',
      form: 'tablet',
      schedule: { kind: 'daily', times: ['08:00'] },
      startDate: '2026-10-01',
      notes: 'with food',
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect(await repo.get('id-1')).toEqual(saved)

    clock = 2000
    const updated = await repo.save({ ...saved, schedule: { kind: 'as-needed' }, endDate: '2026-12-31' })
    expect(updated).toMatchObject({ id: 'id-1', createdAt: 1000, updatedAt: 2000, endDate: '2026-12-31' })
    expect((await repo.get('id-1'))?.schedule).toEqual({ kind: 'as-needed' })

    await repo.remove('id-1')
    expect(await repo.get('id-1')).toBeUndefined()
    expect(await repo.list()).toEqual([])
  })

  it('lists medications by name, ignoring case', async () => {
    const repo = makeRepo()
    for (const name of ['zinc', 'Aspirin example', 'metformin example', 'Brand B']) await repo.save(input({ name }))
    expect((await repo.list()).map((m) => m.name)).toEqual(['Aspirin example', 'Brand B', 'metformin example', 'zinc'])
  })

  it('keeps data across connections', async () => {
    const name = `test-${++dbCount}`
    const first = createMedicationRepository({ dbName: name })
    const saved = await first.save(input())
    await first.close()
    const second = makeRepo({ dbName: name })
    expect(await second.list()).toEqual([saved])
  })

  it('rejects invalid input without writing', async () => {
    const repo = makeRepo()
    await expect(repo.save(input({ name: '   ' }))).rejects.toThrow(/name/)
    await expect(repo.save(input({ schedule: { kind: 'daily', times: [] } }))).rejects.toThrow(/time/)
    await expect(repo.save(input({ id: 'missing' }))).rejects.toThrow(/no longer exists/)
    expect(await repo.list()).toEqual([])
  })
})

describe('normalizeMedicationInput', () => {
  it('sorts and de-duplicates times and days', () => {
    expect(
      normalizeMedicationInput(input({ schedule: { kind: 'weekly', days: [5, 1, 5], times: ['20:00', '08:00', '08:00'] } }))
        .schedule,
    ).toEqual({ kind: 'weekly', days: [1, 5], times: ['08:00', '20:00'] })
  })

  it('drops an empty end date and stray schedule fields', () => {
    const out = normalizeMedicationInput({
      ...input({ endDate: '' }),
      schedule: { kind: 'as-needed', times: ['08:00'] },
    })
    expect(out).not.toHaveProperty('endDate')
    expect(out.schedule).toEqual({ kind: 'as-needed' })
  })

  it('names the field that is wrong', () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ form: 'pill' }, 'form'],
      [{ startDate: '2026-02-30' }, 'startDate'],
      [{ endDate: '2026-09-30' }, 'endDate'],
      [{ name: 'x'.repeat(101) }, 'name'],
      [{ strength: 5 }, 'strength'],
      [{ schedule: { kind: 'daily', times: ['8am'] } }, 'times'],
      [{ schedule: { kind: 'daily', times: Array.from({ length: 13 }, (_, i) => `${String(i).padStart(2, '0')}:00`) } }, 'times'],
      [{ schedule: { kind: 'weekly', days: [], times: ['08:00'] } }, 'days'],
      [{ schedule: { kind: 'weekly', days: [7], times: ['08:00'] } }, 'days'],
      [{ schedule: { kind: 'monthly' } }, 'schedule'],
    ]
    for (const [patch, field] of bad) {
      expect(() => normalizeMedicationInput({ ...input(), ...patch }), field).toThrow(
        expect.objectContaining({ field }),
      )
    }
  })
})

const dose = (medicationId: string, date: string, time: string) => ({
  key: doseKey(medicationId, date, time),
  medicationId,
  date,
  time,
})

describe('dose logs', () => {
  it('sets, replaces and clears a dose status', async () => {
    let clock = Date.parse('2026-10-16T08:05:00Z')
    const repo = makeRepo({ now: () => clock })
    const med = await repo.save(input())
    const d = dose(med.id, '2026-10-16', '08:00')

    expect(await repo.setStatus(d, 'snoozed')).toEqual({
      ...d,
      status: 'snoozed',
      loggedAt: clock,
      snoozedUntil: clock + SNOOZE_MINUTES * 60_000,
    })
    clock += 20 * 60_000
    await repo.setStatus(d, 'taken')
    expect(await repo.listLogs({ from: '2026-10-16', to: '2026-10-16' })).toEqual([
      { ...d, status: 'taken', loggedAt: clock },
    ])

    await repo.clearLog(d.key)
    expect(await repo.listLogs({ from: '2026-10-16', to: '2026-10-16' })).toEqual([])
  })

  it('lists logs for an inclusive date range in order', async () => {
    const repo = makeRepo()
    for (const [date, time] of [
      ['2026-10-17', '08:00'],
      ['2026-10-15', '20:00'],
      ['2026-10-16', '08:00'],
      ['2026-10-15', '08:00'],
      ['2026-10-14', '08:00'],
    ]) {
      await repo.setStatus(dose('m', date, time), 'taken')
    }
    const logs = await repo.listLogs({ from: '2026-10-15', to: '2026-10-16' })
    expect(logs.map((l) => `${l.date} ${l.time}`)).toEqual(['2026-10-15 08:00', '2026-10-15 20:00', '2026-10-16 08:00'])
    expect(await repo.listLogs({ from: '2026-10-16', to: '2026-10-15' })).toEqual([])
  })

  it('logs as-needed doses on the calendar day of the given zone', async () => {
    // 01:30 UTC on 17 October is still 16 October in New York.
    const clock = Date.parse('2026-10-17T01:30:00Z')
    const repo = makeRepo({ now: () => clock })
    const log = await repo.logAsNeeded('p', 'America/New_York')
    expect(log).toEqual({
      key: asNeededKey('p', '2026-10-16', clock),
      medicationId: 'p',
      date: '2026-10-16',
      time: '21:30',
      status: 'taken',
      asNeeded: true,
      loggedAt: clock,
    })
  })

  it('removes a medication’s logs with it, and only its logs', async () => {
    const repo = makeRepo()
    const a = await repo.save(input({ name: 'A' }))
    const b = await repo.save(input({ name: 'B' }))
    await repo.setStatus(dose(a.id, '2026-10-16', '08:00'), 'taken')
    await repo.setStatus(dose(b.id, '2026-10-16', '08:00'), 'taken')
    await repo.remove(a.id)
    const logs = await repo.listLogs({ from: '2026-10-01', to: '2026-10-31' })
    expect(logs.map((l) => l.medicationId)).toEqual([b.id])
  })
})

describe('schema upgrade', () => {
  it('upgrades a v1 database to v2 and keeps its medications', async () => {
    const name = `test-${++dbCount}`
    const v1 = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('medications', { keyPath: 'id' }).createIndex('name', 'name')
        db.createObjectStore('meta').put(1, 'schemaVersion')
      },
    })
    const old = { ...input(), id: 'old', createdAt: 1, updatedAt: 1 }
    await v1.put('medications', old)
    v1.close()

    const repo = makeRepo({ dbName: name })
    expect(await repo.list()).toEqual([old])
    await repo.setStatus(dose('old', '2026-10-16', '08:00'), 'taken')
    expect(await repo.listLogs({ from: '2026-10-16', to: '2026-10-16' })).toHaveLength(1)
    await repo.close()

    const raw = await openDB(name, SCHEMA_VERSION)
    expect(await raw.get('meta', 'schemaVersion')).toBe(2)
    raw.close()
  })
})
