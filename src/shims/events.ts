/**
 * Vite serves CJS `events` without named ESM exports when stellar-wallets-kit
 * is excluded from optimizeDeps. WalletConnect / AppKit then fail with:
 * "does not provide an export named 'EventEmitter'".
 *
 * Import the CJS file by absolute path (bypasses this alias) and re-export
 * named + default so ESM importers work.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import eventsCjs from '../../node_modules/events/events.js'

type EventEmitterCtor = typeof eventsCjs & {
  EventEmitter: typeof eventsCjs
  once: typeof eventsCjs.once
  listenerCount: typeof eventsCjs.listenerCount
}

const EventEmitter = eventsCjs as EventEmitterCtor

export default EventEmitter
export { EventEmitter }
export const once = EventEmitter.once
export const listenerCount = EventEmitter.listenerCount
