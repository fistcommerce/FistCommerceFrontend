/**
 * Node builtins used by @stellar/stellar-sdk / XDR in the browser.
 * Must load before any Stellar/Soroban imports.
 */
import { Buffer } from 'buffer'

const g = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
  global?: typeof globalThis
}

if (!g.Buffer) g.Buffer = Buffer
if (!g.global) g.global = globalThis
