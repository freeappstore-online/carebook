// Optional PIN lock, local to this device. The PIN itself is never stored:
// localStorage keeps a salted PBKDF2-SHA-256 hash. The lock keeps casual
// onlookers out of the app; it doesn't encrypt the data in IndexedDB.

export const PIN_KEY = 'carebook:pin'
export const ATTEMPTS_KEY = 'carebook:pin-attempts'
export const PIN_PATTERN = /^\d{4,8}$/
const ITERATIONS = 150_000

/** After this many wrong PINs in a row, entry pauses. */
export const FREE_ATTEMPTS = 5
const FIRST_WAIT_MS = 30_000
const MAX_WAIT_MS = 15 * 60_000

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface StoredPin {
  v: 1
  salt: string
  hash: string
  iterations: number
}

interface Attempts {
  failures: number
  /** Epoch ms before which no attempt is accepted. */
  until: number
}

export type VerifyResult = { ok: true } | { ok: false; retryAt?: number; failures: number }

export const isValidPin = (pin: string) => PIN_PATTERN.test(pin)

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return new Uint8Array(bits)
}

function read(storage: KeyValue): StoredPin | null {
  try {
    const parsed = JSON.parse(storage.getItem(PIN_KEY) ?? 'null') as StoredPin | null
    return parsed && parsed.v === 1 && parsed.salt && parsed.hash ? parsed : null
  } catch {
    return null
  }
}

function readAttempts(storage: KeyValue): Attempts {
  try {
    const a = JSON.parse(storage.getItem(ATTEMPTS_KEY) ?? 'null') as Attempts | null
    return a && Number.isFinite(a.failures) && Number.isFinite(a.until) ? a : { failures: 0, until: 0 }
  } catch {
    return { failures: 0, until: 0 }
  }
}

export function hasPin(storage: KeyValue = localStorage): boolean {
  return read(storage) !== null
}

export async function setPin(pin: string, storage: KeyValue = localStorage): Promise<void> {
  if (!isValidPin(pin)) throw new RangeError('A PIN is 4 to 8 digits')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITERATIONS)
  const stored: StoredPin = { v: 1, salt: toB64(salt), hash: toB64(hash), iterations: ITERATIONS }
  storage.setItem(PIN_KEY, JSON.stringify(stored))
  storage.removeItem(ATTEMPTS_KEY)
}

export function clearPin(storage: KeyValue = localStorage): void {
  storage.removeItem(PIN_KEY)
  storage.removeItem(ATTEMPTS_KEY)
}

/** When the next attempt is allowed, if entry is paused. */
export function retryAt(storage: KeyValue = localStorage, now = Date.now()): number | undefined {
  const { until } = readAttempts(storage)
  return until > now ? until : undefined
}

/** Wait after `failures` wrong PINs in a row: none at first, then 30 s doubling to 15 min. */
export function waitAfter(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0
  return Math.min(MAX_WAIT_MS, FIRST_WAIT_MS * 2 ** (failures - FREE_ATTEMPTS))
}

/** Checks a PIN. With no PIN set, anything unlocks. */
export async function verifyPin(pin: string, storage: KeyValue = localStorage, now = Date.now()): Promise<VerifyResult> {
  const stored = read(storage)
  if (!stored) return { ok: true }
  const attempts = readAttempts(storage)
  if (attempts.until > now) return { ok: false, retryAt: attempts.until, failures: attempts.failures }

  const hash = await derive(pin, fromB64(stored.salt), stored.iterations)
  const expected = fromB64(stored.hash)
  let diff = hash.length ^ expected.length
  for (let i = 0; i < Math.min(hash.length, expected.length); i++) diff |= hash[i] ^ expected[i]
  if (diff === 0) {
    storage.removeItem(ATTEMPTS_KEY)
    return { ok: true }
  }

  const failures = attempts.failures + 1
  const wait = waitAfter(failures)
  storage.setItem(ATTEMPTS_KEY, JSON.stringify({ failures, until: wait ? now + wait : 0 }))
  return wait ? { ok: false, retryAt: now + wait, failures } : { ok: false, failures }
}
