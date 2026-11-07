/**
 * Stellar SDK / XDR paths expect Node's Buffer in the browser.
 * Import this first from the app entry so Soroban invokes do not throw
 * "Buffer is not defined".
 */
import { Buffer } from 'buffer'

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer }

if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer
}

export {}
