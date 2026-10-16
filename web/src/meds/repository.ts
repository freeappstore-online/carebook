// On-device storage for medications (IndexedDB). Nothing here leaves the device.

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { Medication, MedicationInput } from './types'
import { MedicationError, normalizeMedicationInput } from './validate'

export const DB_NAME = 'carebook'
/** The IndexedDB version is the schema version; later tickets add stores here. */
export const SCHEMA_VERSION = 1

export interface CarebookDB extends DBSchema {
  medications: { key: string; value: Medication; indexes: { name: string } }
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
  remove(id: string): Promise<void>
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
      await (await open()).delete('medications', id)
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
