/**
 * Browser shims for Node builtins expected by @circle-fin/w3s-pw-web-sdk
 * (via jsonwebtoken / firebase). Must load before that SDK is imported.
 */
import { Buffer } from 'buffer'

type ProcessShim = {
  env: Record<string, string | undefined>
  version: string
  browser: boolean
}

const g = globalThis as typeof globalThis & {
  global?: typeof globalThis
  Buffer?: typeof Buffer
  process?: ProcessShim
}

if (!g.global) g.global = g
if (!g.Buffer) g.Buffer = Buffer

const existing = g.process
if (!existing) {
  ;(g as { process: ProcessShim }).process = {
    env: { NODE_ENV: import.meta.env.MODE },
    version: '18.0.0',
    browser: true,
  }
} else {
  if (!existing.env) existing.env = {}
  if (!existing.env.NODE_ENV) existing.env.NODE_ENV = import.meta.env.MODE
  if (!existing.version) existing.version = '18.0.0'
  if (existing.browser == null) existing.browser = true
}
