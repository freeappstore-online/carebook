// JSON backup of everything Carebook keeps in IndexedDB. Export writes one
// file; import checks every record before anything on the device is replaced.
// The PIN is not part of a backup.

import { SCHEMA_VERSION } from '../meds/repository'
import type { Medication } from '../meds/types'
import { MedicationError, normalizeMedicationInput } from '../meds/validate'
import { isValidDate, isValidTime } from '../meds/zoned'
import { DOSE_STATUSES, type DoseLog } from '../today/types'
import type { Reading } from '../vitals/types'
import { ReadingError, normalizeReadingInput } from '../vitals/validate'

export const BACKUP_FORMAT = 'carebook-backup'

export interface BackupData {
  medications: Medication[]
  adherence: DoseLog[]
  vitals: Reading[]
}

export interface Backup extends BackupData {
  format: typeof BACKUP_FORMAT
  /** The IndexedDB schema version the data came from. */
  schemaVersion: number
  /** ISO 8601 time of the export. */
  exportedAt: string
  app: 'Carebook'
  note: string
}

export const BACKUP_NOTE =
  'Carebook backup. It holds your medications, dose log and readings in plain text: keep it somewhere private. Log and share with your clinician.'

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

export interface ParsedBackup {
  backup: Backup
  /** Things the user should know before importing (older version, skipped records). */
  warnings: string[]
}

export function buildBackup(data: BackupData, now: number): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date(now).toISOString(),
    app: 'Carebook',
    note: BACKUP_NOTE,
    medications: data.medications,
    adherence: data.adherence,
    vitals: data.vitals,
  }
}

export const backupFileName = (now: number) => `carebook-backup-${new Date(now).toISOString().slice(0, 10)}.json`

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200

function list(value: unknown, name: string, required: boolean): unknown[] {
  if (value === undefined && !required) return []
  if (!Array.isArray(value)) throw new BackupError(`The backup's ${name} list is missing or damaged.`)
  return value
}

function medication(value: unknown, i: number): Medication {
  const where = `Medication ${i + 1}`
  if (!isRecord(value) || !isId(value.id)) throw new BackupError(`${where} has no id.`)
  if (!isTime(value.createdAt) || !isTime(value.updatedAt)) throw new BackupError(`${where} has damaged timestamps.`)
  try {
    return { ...normalizeMedicationInput(value), id: value.id, createdAt: value.createdAt, updatedAt: value.updatedAt }
  } catch (err) {
    if (err instanceof MedicationError) throw new BackupError(`${where}: ${err.message}.`)
    throw err
  }
}

function doseLog(value: unknown, i: number): DoseLog {
  const where = `Dose log ${i + 1}`
  if (!isRecord(value) || !isId(value.key) || !isId(value.medicationId)) throw new BackupError(`${where} is damaged.`)
  if (typeof value.date !== 'string' || !isValidDate(value.date)) throw new BackupError(`${where} has an invalid date.`)
  if (typeof value.time !== 'string' || !isValidTime(value.time)) throw new BackupError(`${where} has an invalid time.`)
  if (!(DOSE_STATUSES as readonly unknown[]).includes(value.status)) throw new BackupError(`${where} has an unknown status.`)
  if (!isTime(value.loggedAt)) throw new BackupError(`${where} has a damaged timestamp.`)
  if (value.snoozedUntil !== undefined && !isTime(value.snoozedUntil)) throw new BackupError(`${where} has a damaged snooze time.`)
  return {
    key: value.key,
    medicationId: value.medicationId,
    date: value.date,
    time: value.time,
    status: value.status as DoseLog['status'],
    loggedAt: value.loggedAt,
    ...(value.asNeeded === true ? { asNeeded: true as const } : {}),
    ...(value.snoozedUntil !== undefined ? { snoozedUntil: value.snoozedUntil as number } : {}),
  }
}

function reading(value: unknown, i: number): Reading {
  const where = `Reading ${i + 1}`
  if (!isRecord(value) || !isId(value.id)) throw new BackupError(`${where} has no id.`)
  if (!isTime(value.takenAt) || !isTime(value.createdAt) || !isTime(value.updatedAt)) {
    throw new BackupError(`${where} has damaged timestamps.`)
  }
  try {
    return { ...normalizeReadingInput(value), id: value.id, takenAt: value.takenAt, createdAt: value.createdAt, updatedAt: value.updatedAt }
  } catch (err) {
    if (err instanceof ReadingError) throw new BackupError(`${where}: ${err.message}.`)
    throw err
  }
}

function unique<T>(items: T[], id: (t: T) => string, what: string) {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(id(item))) throw new BackupError(`The backup has two ${what} with the same id.`)
    seen.add(id(item))
  }
}

/** Reads and checks a backup file's text. Throws BackupError with a plain message. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('This file isn’t valid JSON, so it can’t be a Carebook backup.')
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('This file isn’t a Carebook backup.')
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupError('The backup has no valid version number.')
  }
  if (version > SCHEMA_VERSION) {
    throw new BackupError(
      `This backup was made by a newer version of Carebook (data version ${version}; this one reads up to ${SCHEMA_VERSION}). Reload the app to update it, then try again.`,
    )
  }

  const warnings: string[] = []
  if (version < SCHEMA_VERSION) {
    warnings.push(
      `This backup is from an older version of Carebook (data version ${version}; this one uses ${SCHEMA_VERSION}). Anything that version didn’t record is left empty.`,
    )
  }

  // Version 1 had medications only; dose logs arrived in 2 and vitals in 3.
  const medications = list(raw.medications, 'medications', true).map(medication)
  const allLogs = list(raw.adherence, 'dose log', version >= 2).map(doseLog)
  const vitals = list(raw.vitals, 'readings', version >= 3).map(reading)
  unique(medications, (m) => m.id, 'medications')
  unique(allLogs, (l) => l.key, 'dose logs')
  unique(vitals, (r) => r.id, 'readings')

  const ids = new Set(medications.map((m) => m.id))
  const adherence = allLogs.filter((l) => ids.has(l.medicationId))
  const orphans = allLogs.length - adherence.length
  if (orphans > 0) {
    warnings.push(`${orphans} dose ${orphans === 1 ? 'log belongs' : 'logs belong'} to a medication that isn’t in the backup and will be skipped.`)
  }

  const exportedAt = typeof raw.exportedAt === 'string' && !Number.isNaN(Date.parse(raw.exportedAt)) ? raw.exportedAt : ''
  return {
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: version,
      exportedAt,
      app: 'Carebook',
      note: BACKUP_NOTE,
      medications,
      adherence,
      vitals,
    },
    warnings,
  }
}

export function describeBackup(b: BackupData): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  return `${n(b.medications.length, 'medication', 'medications')}, ${n(b.adherence.length, 'dose log entry', 'dose log entries')} and ${n(b.vitals.length, 'reading', 'readings')}`
}
