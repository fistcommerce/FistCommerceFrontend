/**
 * Browser-safe stub for `jsonwebtoken`.
 * Circle's W3S web SDK only calls `decode()` to read OAuth id_token claims (nonce).
 * The real package breaks under Vite (`Object.create(undefined)` via CJS error classes).
 */

function base64UrlToJson(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const b64 = padded + '='.repeat(padLen)
  const json = atob(b64)
  return JSON.parse(json) as unknown
}

export function decode(
  token: string,
  options?: { complete?: boolean },
): null | Record<string, unknown> | { header: unknown; payload: unknown; signature: string } {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const header = base64UrlToJson(parts[0]!)
    const payload = base64UrlToJson(parts[1]!)
    if (options?.complete) {
      return {
        header,
        payload,
        signature: parts[2] ?? '',
      }
    }
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

export function sign(): never {
  throw new Error('jsonwebtoken.sign is not available in the browser shim.')
}

export function verify(): never {
  throw new Error('jsonwebtoken.verify is not available in the browser shim.')
}

const jwt = { decode, sign, verify }
export default jwt
