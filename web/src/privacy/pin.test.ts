import { beforeEach, describe, expect, it } from 'vitest'
import { ATTEMPTS_KEY, FREE_ATTEMPTS, PIN_KEY, clearPin, hasPin, isValidPin, retryAt, setPin, verifyPin, waitAfter } from './pin'

/** A Storage stand-in (Node has no localStorage). */
class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
})

describe('PIN lock', () => {
  it('accepts 4 to 8 digits only', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('12345678')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('123456789')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
    expect(isValidPin('')).toBe(false)
  })

  it('sets a PIN without storing it in the clear', async () => {
    expect(hasPin(storage)).toBe(false)
    await setPin('4821', storage)
    expect(hasPin(storage)).toBe(true)
    const stored = storage.getItem(PIN_KEY)!
    expect(stored).not.toContain('4821')
    expect(JSON.parse(stored)).toMatchObject({ v: 1, iterations: expect.any(Number), salt: expect.any(String), hash: expect.any(String) })
    await expect(setPin('12', storage)).rejects.toThrow(/4 to 8/)
  })

  it('salts each PIN, so the same PIN hashes differently', async () => {
    await setPin('4821', storage)
    const first = storage.getItem(PIN_KEY)
    await setPin('4821', storage)
    expect(storage.getItem(PIN_KEY)).not.toBe(first)
  })

  it('unlocks with the correct PIN', async () => {
    await setPin('4821', storage)
    expect(await verifyPin('4821', storage)).toEqual({ ok: true })
  })

  it('refuses a wrong PIN', async () => {
    await setPin('4821', storage)
    expect(await verifyPin('4822', storage)).toEqual({ ok: false, failures: 1 })
    expect(await verifyPin('48210', storage)).toEqual({ ok: false, failures: 2 })
    expect(await verifyPin('', storage)).toEqual({ ok: false, failures: 3 })
    // A right PIN resets the count.
    expect(await verifyPin('4821', storage)).toEqual({ ok: true })
    expect(storage.getItem(ATTEMPTS_KEY)).toBeNull()
  })

  it('pauses entry after repeated wrong PINs, then allows it again', async () => {
    await setPin('4821', storage)
    let now = 1_000_000
    for (let i = 1; i < FREE_ATTEMPTS; i++) expect((await verifyPin('0000', storage, now)).ok).toBe(false)
    const paused = await verifyPin('0000', storage, now)
    expect(paused).toEqual({ ok: false, failures: FREE_ATTEMPTS, retryAt: now + 30_000 })
    expect(retryAt(storage, now)).toBe(now + 30_000)
    // Even the right PIN waits.
    expect(await verifyPin('4821', storage, now + 1000)).toMatchObject({ ok: false, retryAt: now + 30_000 })
    now += 30_000
    expect(retryAt(storage, now)).toBeUndefined()
    expect(await verifyPin('4821', storage, now)).toEqual({ ok: true })
  })

  it('doubles the pause up to 15 minutes', () => {
    expect(waitAfter(FREE_ATTEMPTS - 1)).toBe(0)
    expect(waitAfter(FREE_ATTEMPTS)).toBe(30_000)
    expect(waitAfter(FREE_ATTEMPTS + 1)).toBe(60_000)
    expect(waitAfter(FREE_ATTEMPTS + 20)).toBe(15 * 60_000)
  })

  it('clears the PIN and the attempt count', async () => {
    await setPin('4821', storage)
    await verifyPin('0000', storage)
    clearPin(storage)
    expect(hasPin(storage)).toBe(false)
    expect(storage.getItem(ATTEMPTS_KEY)).toBeNull()
    // With no PIN, the app opens.
    expect(await verifyPin('anything', storage)).toEqual({ ok: true })
  })

  it('treats a damaged stored PIN as no PIN', () => {
    storage.setItem(PIN_KEY, '{not json')
    expect(hasPin(storage)).toBe(false)
  })
})
