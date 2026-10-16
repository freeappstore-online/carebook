// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { clearPin, setPin } from './privacy/pin'

afterEach(() => {
  cleanup()
  clearPin()
})

describe('App PIN gate', () => {
  it('shows only the lock screen until the PIN is entered', async () => {
    await setPin('2468')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Carebook is locked' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('PIN'), '2468')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Carebook is locked' })).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })

  it('opens straight away with no PIN', async () => {
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Carebook is locked' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
  })
})
