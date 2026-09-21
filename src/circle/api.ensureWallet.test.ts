import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/apiRequestError'
import { TESTNET_CHAIN_ID } from '@/contract_config/contractNetwork'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    apiUrl: (path: string) => `http://localhost:8000/api${path.startsWith('/') ? path : `/${path}`}`,
  }
})

import { circleEnsureChallengeId, postCircleEnsureWallet } from '@/circle/api'

describe('postCircleEnsureWallet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('surfaces PIN challengeId from 409 instead of a generic API conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: 'EOA wallet creation requires PIN confirmation',
            code: 'wallet_creation_required',
            challengeId: 'chal-create',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const err = await postCircleEnsureWallet({
      chainId: TESTNET_CHAIN_ID,
      userToken: 'utok',
    }).catch((e) => e)

    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ApiRequestError)
    expect(circleEnsureChallengeId(err)).toBe('chal-create')
    expect((err as { code?: string }).code).toBe('wallet_creation_required')
    expect(String(err.message)).toMatch(/PIN confirmation/i)
  })

  it('returns an EOA wallet on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            walletId: 'w1',
            address: '0xFBC412d22F99A260C9A41b2a2a86893d7996CCA0',
            chainId: TESTNET_CHAIN_ID,
            accountType: 'EOA',
            blockchain: 'ARB-SEPOLIA',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const wallet = await postCircleEnsureWallet({
      chainId: TESTNET_CHAIN_ID,
      userToken: 'utok',
    })
    expect(wallet.walletId).toBe('w1')
    expect(wallet.chainId).toBe(TESTNET_CHAIN_ID)
    expect(wallet.accountType).toBe('EOA')
  })
})
