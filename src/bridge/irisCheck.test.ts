import { describe, expect, it } from 'vitest'

import { irisCheckSummary } from '@/bridge/irisCheck'

describe('irisCheckSummary', () => {
  it('explains 404 and empty payloads', () => {
    expect(irisCheckSummary({ http_status: 404, iris: { messages: [] } })).toMatch(/not indexed/i)
    expect(irisCheckSummary({ http_status: 200, iris: { messages: [] } })).toMatch(/no message/i)
  })

  it('explains pending vs complete forwarder mint', () => {
    expect(
      irisCheckSummary({
        http_status: 200,
        iris: { messages: [{ status: 'pending_confirmations' }] },
      }),
    ).toMatch(/still confirming/i)
    expect(
      irisCheckSummary({
        http_status: 200,
        iris: { messages: [{ status: 'complete', forwardTxHash: `0x${'a'.repeat(64)}` }] },
      }),
    ).toMatch(/arrived on Arc/i)
  })
})
