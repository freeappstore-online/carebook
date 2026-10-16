// On-device storage for medications and dose logs (IndexedDB). Nothing here
// leaves the device.

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { type DoseLog, type DoseStatus, SNOOZE_MINUTES, asNeededKey } from '../today/types'
import type { ScheduledDose } from './schedule'
import type { Medication, MedicationInput } from './types'
import { type LocalDate, dateAt, timeAt } from './zoned'
import { MedicationError, normalizeMedicationInput } from './validate'

export const DB_NAME = 'carebook'
/** The IndexedDB version is the schema version; later tickets add stores here. */
export const SCHEMA_VERSION = 2

export interface CarebookDB extends DBSchema {
  medications: { key: string; value: Medication; indexes: { name: string } }
  /** Since v2: one record per logged dose, keyed by dose key. */
  adherence: { key: string; value: DoseLog; indexes: { date: string; medicationId: string } }
  /** schemaVersion and similar bookkeeping. */
  meta: { key: string; value: unknown }
}

export function openCarebookDB(name = DB_NAME, onBlocking?: () => void): Promise<IDBPDatabase<CarebookDB>> {
  return openDB<CarebookDB>(name, SCHEMA_VERSION, {
    upgrade(db, _oldVersion, newVersion, tx) {
      if (!db.objectStoreNames.contains('medications')) {
        db.createObjectStore('medications', { keyPath: 'id' }).createIndex('name', 'name')
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      // v2: dose logs. Creating a store keeps every existing record as it is.
      if (!db.objectStoreNames.contains('adherence')) {
        const store = db.createObjectStore('adherence', { keyPath: 'key' })
        store.createIndex('date', 'date')
        store.createIndex('medicationId', 'medicationId')
      }
      tx.objectStore('meta').put(newVersion ?? SCHEMA_VERSION, 'schemaVersion').catch(() => {})
    },
    // A newer tab wants to upgrade: step aside and reopen on next use.
    blocking: onBlocking,
  })
}

export interface MedicationRepository {
  list(): Promise<Medication[]>
  get(id: string): Promise<Medication | undefined>
  /** Creates a medication, or updates it when `input.id` exists. */
  save(input: MedicationInput): Promise<Medication>
  /** Removes a medication and its logged doses. */
  remove(id: string): Promise<void>
  /** Dose logs for an inclusive range of days, by date then time. */
  listLogs(range: { from: LocalDate; to: LocalDate }): Promise<DoseLog[]>
  /** Logs a scheduled dose as taken, skipped or snoozed, replacing any earlier log. */
  setStatus(dose: Pick<ScheduledDose, 'key' | 'medicationId' | 'date' | 'time'>, status: DoseStatus): Promise<DoseLog>
  /** Logs a dose of an as-needed medication, taken now. */
  logAsNeeded(medicationId: string, timeZone: string): Promise<DoseLog>
  /** Removes a log (undo). */
  clearLog(key: string): Promise<void>
  close(): Promise<void>
}

export interface RepositoryOptions {
  dbName?: string
  now?: () => number
  newId?: () => string
}

const byName = (a: Medication, b: Medication) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.createdAt - b.createdAt

export function createMedicationRepository({
  dbName = DB_NAME,
  now = Date.now,
  newId = () => crypto.randomUUID(),
}: RepositoryOptions = {}): MedicationRepository {
  let db: Promise<IDBPDatabase<CarebookDB>> | undefined
  const open = () => {
    if (!db) {
      const opening = openCarebookDB(dbName, () => {
        void opening.then((conn) => conn.close())
        if (db === opening) db = undefined
      })
      db = opening
    }
    return db
  }

  return {
    async list() {
      return (await (await open()).getAll('medications')).sort(byName)
    },
    async get(id) {
      return (await open()).get('medications', id)
    },
    async save(input) {
      const fields = normalizeMedicationInput(input)
      const conn = await open()
      const tx = conn.transaction('medications', 'readwrite')
      const existing = input.id ? await tx.store.get(input.id) : undefined
      if (input.id && !existing) {
        tx.abort()
        await tx.done.catch(() => {})
        throw new MedicationError('id', 'That medication no longer exists')
      }
      const time = now()
      const med: Medication = {
        ...fields,
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? time,
        updatedAt: time,
      }
      await tx.store.put(med)
      await tx.done
      return med
    },
    async remove(id) {
      const tx = (await open()).transaction(['medications', 'adherence'], 'readwrite')
      const logs = tx.objectStore('adherence')
      const keys = await logs.index('medicationId').getAllKeys(id)
      await Promise.all([tx.objectStore('medications').delete(id), ...keys.map((k) => logs.delete(k))])
      await tx.done
    },
    async listLogs({ from, to }) {
      if (to < from) return []
      const logs = await (await open()).getAllFromIndex('adherence', 'date', IDBKeyRange.bound(from, to))
      return logs.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.loggedAt - b.loggedAt)
    },
    async setStatus(dose, status) {
      const loggedAt = now()
      const log: DoseLog = {
        key: dose.key,
        medicationId: dose.medicationId,
        date: dose.date,
        time: dose.time,
        status,
        loggedAt,
        ...(status === 'snoozed' ? { snoozedUntil: loggedAt + SNOOZE_MINUTES * 60_000 } : {}),
      }
      await (await open()).put('adherence', log)
      return log
    },
    async logAsNeeded(medicationId, timeZone) {
      const loggedAt = now()
      const date = dateAt(loggedAt, timeZone)
      const log: DoseLog = {
        key: asNeededKey(medicationId, date, loggedAt),
        medicationId,
        date,
        time: timeAt(loggedAt, timeZone),
        status: 'taken',
        asNeeded: true,
        loggedAt,
      }
      await (await open()).put('adherence', log)
      return log
    },
    async clearLog(key) {
      await (await open()).delete('adherence', key)
    },
    async close() {
      if (!db) return
      const conn = await db
      conn.close()
      db = undefined
    },
  }
}

export const medicationRepo = createMedicationRepository()
