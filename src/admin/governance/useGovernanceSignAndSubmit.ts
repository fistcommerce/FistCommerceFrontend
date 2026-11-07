import { useCallback, useState } from 'react'

import { toAppUserFacingError } from '@/errors/toAppUserFacingError'
import {
  fetchMultisigProposalDetail,
  fetchMultisigSigningPayload,
  postMultisigProposalSign,
} from '@/api/multisig/proposals'
import {
  isGovernanceSignerAddress,
  resolveGovernanceActorAddress,
} from '@/admin/governance/governanceSigner'
import type { GovernanceSignSubmitResult } from '@/admin/governance/types'
import {
  nonceWarningToConfirmPayload,
  type GovernanceConfirmModalApi,
} from '@/admin/governance/useGovernanceConfirmModal'
import { isStellarChainId } from '@/stellar/chain'
import { useAppSelector } from '@/store/hooks'
import { ensureWalletChain, getWalletClientFromPrivyWallet } from '@/wallet/viemClients'
import { signUserOpHashTypedData } from '@/wallet/signUserOpHash'
import { useActiveWallet } from '@/wallet/useActiveWallet'

export type UseGovernanceSignAndSubmitOptions = {
  confirmNonceWarning?: GovernanceConfirmModalApi['confirmNonceWarning']
}

export function useGovernanceSignAndSubmit(options: UseGovernanceSignAndSubmitOptions = {}) {
  const { confirmNonceWarning } = options
  const accessToken = useAppSelector((s) => s.auth.accessToken)
  const sessionWallet = useAppSelector((s) => s.auth.wallet)
  const { wallet, address, isConnected } = useActiveWallet()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signAndSubmit = useCallback(
    async (proposalId: string): Promise<GovernanceSignSubmitResult | null> => {
      const id = proposalId.trim()
      if (!id) {
        setError('Missing proposal id.')
        return null
      }
      if (!accessToken?.trim()) {
        setError('Sign in to sign proposals.')
        return null
      }

      setPending(true)
      setError(null)
      try {
        const payload = await fetchMultisigSigningPayload(accessToken, id)
        const isSoroban =
          payload.vm === 'soroban' ||
          isStellarChainId(payload.chainId) ||
          !payload.typedData

        const actor = resolveGovernanceActorAddress({
          connectedAddress: address,
          sessionWallet,
          allowSessionWalletFallback: isSoroban,
        })
        if (!actor) {
          throw new Error(
            isSoroban
              ? 'Sign in with the Stellar admin (owner) wallet to sign this proposal.'
              : 'Connect your multisig owner wallet to sign.',
          )
        }
        if (
          !isSoroban &&
          sessionWallet?.trim() &&
          sessionWallet.toLowerCase() !== actor.toLowerCase()
        ) {
          throw new Error(
            'Connected wallet must match the wallet used for this admin login session.',
          )
        }
        if (payload.nonceWarning) {
          // Hide loading overlay while the confirm modal is open (same z-index stack).
          setPending(false)
          const proceed = confirmNonceWarning
            ? await confirmNonceWarning(nonceWarningToConfirmPayload(payload.nonceWarning))
            : true
          if (!proceed) {
            return null
          }
          setPending(true)
        }
        if (!isGovernanceSignerAddress(actor, payload.signers)) {
          throw new Error('Connected wallet is not a multisig signer for this proposal.')
        }

        let signature = 'stellar-confirm'
        if (!isSoroban) {
          if (!isConnected || !wallet || !address) {
            throw new Error('Connect your multisig owner wallet to sign.')
          }
          if (payload.chainId > 0) {
            await ensureWalletChain(wallet, payload.chainId)
          }
          if (!payload.typedData) {
            throw new Error('Missing EIP-712 typedData for proposal signature.')
          }
          const walletClient = await getWalletClientFromPrivyWallet(
            wallet,
            payload.chainId > 0 ? payload.chainId : undefined,
          )
          signature = await signUserOpHashTypedData(
            walletClient,
            address as `0x${string}`,
            payload.typedData,
          )
        }

        await postMultisigProposalSign(accessToken, id, {
          signerAddress: actor,
          signature,
        })
        const detail = await fetchMultisigProposalDetail(accessToken, id)
        return {
          proposalId: id,
          signature,
          validSignatureCount: detail.validSignatureCount,
          threshold: detail.threshold,
          readyToExecute: detail.readyToExecute,
          signingNote: payload.signingNote,
        }
      } catch (e) {
        const message = toAppUserFacingError(e, {
          fallback: 'Could not sign proposal.',
          context: 'governance_sign',
        })
        setError(message)
        return null
      } finally {
        setPending(false)
      }
    },
    [accessToken, address, confirmNonceWarning, isConnected, sessionWallet, wallet],
  )

  return { signAndSubmit, pending, error, clearError: () => setError(null) }
}
