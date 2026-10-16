import { type FormEvent, useEffect, useState } from 'react'
import { ConfirmDialog } from '@freeappstore/sdk/ui'
import { verifyPin } from './pin'

export interface LockScreenProps {
  onUnlock: () => void
  /** Erases all Carebook data and the PIN (the way out of a forgotten PIN). */
  onErase: () => Promise<void>
  now?: () => number
  storage?: Storage
}

const field = 'w-full rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-center text-2xl tracking-[0.5em] text-[var(--ink)]'

export function LockScreen({ onUnlock, onErase, now = Date.now, storage = localStorage }: LockScreenProps) {
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [retryAt, setRetryAt] = useState<number | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [, tick] = useState(0)

  // Count down while entry is paused.
  useEffect(() => {
    if (!retryAt) return
    const id = window.setInterval(() => {
      if (now() >= retryAt) setRetryAt(undefined)
      tick((t) => t + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [retryAt, now])

  const waitSeconds = retryAt ? Math.max(0, Math.ceil((retryAt - now()) / 1000)) : 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!pin || checking) return
    setChecking(true)
    try {
      const result = await verifyPin(pin, storage, now())
      if (result.ok) {
        onUnlock()
        return
      }
      setPin('')
      setRetryAt(result.retryAt)
      setMessage(result.retryAt ? 'Too many wrong PINs.' : 'That PIN isn’t right. Try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-sm flex-col justify-center p-6">
      <h1 className="text-center text-2xl font-semibold text-[var(--ink)]">Carebook is locked</h1>
      <p className="mt-2 text-center text-[var(--muted)]">Enter your PIN to open your log.</p>
      <form onSubmit={submit} className="mt-6 grid gap-3">
        <label htmlFor="unlock-pin" className="sr-only">
          PIN
        </label>
        <input
          id="unlock-pin"
          className={field}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          autoFocus
          value={pin}
          disabled={waitSeconds > 0}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <button
          type="submit"
          disabled={!pin || checking || waitSeconds > 0}
          className="rounded-[var(--radius)] bg-[var(--ink)] px-4 py-2 font-semibold text-[var(--paper)] disabled:opacity-60"
        >
          Unlock
        </button>
        <p role="alert" className="min-h-6 text-center text-sm text-[var(--danger)]">
          {message}
          {waitSeconds > 0 && ` Try again in ${waitSeconds} s.`}
        </p>
      </form>
      <button type="button" className="mt-8 text-sm text-[var(--muted)] underline" onClick={() => setErasing(true)}>
        Forgot your PIN?
      </button>
      <ConfirmDialog
        open={erasing}
        title="Erase Carebook on this device?"
        message="A forgotten PIN can’t be recovered, because it’s stored only as a scrambled hash. You can erase all Carebook data on this device and the PIN, then start again or import a backup. This can’t be undone."
        confirmLabel="Erase everything"
        variant="danger"
        onCancel={() => setErasing(false)}
        onConfirm={() => {
          setErasing(false)
          void onErase()
        }}
      />
    </main>
  )
}
