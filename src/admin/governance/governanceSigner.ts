import type { ProposalStatus } from '@/api/types/multisig'

const SIGNABLE_GOVERNANCE_STATUSES: readonly ProposalStatus[] = ['pending_signatures', 'ready']

export function isSignableGovernanceProposalStatus(status: ProposalStatus): boolean {
  return SIGNABLE_GOVERNANCE_STATUSES.includes(status)
}

export function isGovernanceSignerAddress(
  address: string | null | undefined,
  signers: readonly string[],
): boolean {
  if (!address?.trim() || signers.length === 0) return false
  const lower = address.trim().toLowerCase()
  return signers.some((s) => s.toLowerCase() === lower)
}

export function hasGovernanceSignature(
  address: string | null | undefined,
  signedAddresses: readonly string[],
): boolean {
  if (!address?.trim()) return false
  const lower = address.trim().toLowerCase()
  return signedAddresses.some((s) => s.toLowerCase() === lower)
}

export type CanSignGovernanceProposalInput = {
  status: ProposalStatus
  missingSigners: readonly string[]
  walletAddress: string | null | undefined
  multisigSigners: readonly string[]
  /** When provided, suppresses sign if this wallet already signed. */
  signedAddresses?: readonly string[]
  isConnected?: boolean
}

/** True when the connected wallet may submit a new signature for this proposal. */
export function canUserSignGovernanceProposal(input: CanSignGovernanceProposalInput): boolean {
  const {
    status,
    missingSigners,
    walletAddress,
    multisigSigners,
    signedAddresses,
    isConnected = true,
  } = input

  if (!isConnected || !walletAddress?.trim()) return false
  if (!isSignableGovernanceProposalStatus(status)) return false
  if (!isGovernanceSignerAddress(walletAddress, multisigSigners)) return false

  if (signedAddresses?.length && hasGovernanceSignature(walletAddress, signedAddresses)) {
    return false
  }

  if (missingSigners.length === 0) return false

  const walletLower = walletAddress.trim().toLowerCase()
  return missingSigners.some((s) => s.toLowerCase() === walletLower)
}

export type CanExecuteGovernanceProposalInput = {
  readyToExecute: boolean
  status: ProposalStatus
  walletAddress: string | null | undefined
  multisigSigners: readonly string[]
  /** Admin login wallet; when set, must match connected wallet. */
  sessionWallet?: string | null
  isConnected?: boolean
}

/**
 * True when a click would pass the same owner/session checks as
 * {@link useGovernanceExecuteProposal} (before fetching execution-payload).
 */
export function canUserExecuteGovernanceProposal(input: CanExecuteGovernanceProposalInput): boolean {
  const {
    readyToExecute,
    status,
    walletAddress,
    multisigSigners,
    sessionWallet,
    isConnected = true,
  } = input

  if (!readyToExecute) return false
  if (status === 'executed' || status === 'cancelled') return false
  if (!isConnected || !walletAddress?.trim()) return false
  if (!isGovernanceSignerAddress(walletAddress, multisigSigners)) return false
  if (
    sessionWallet?.trim() &&
    sessionWallet.trim().toLowerCase() !== walletAddress.trim().toLowerCase()
  ) {
    return false
  }
  return true
}

export function sessionWalletMatchesConnected(
  sessionWallet: string | null | undefined,
  connectedAddress: string | null | undefined,
): boolean {
  if (!sessionWallet?.trim()) return true
  if (!connectedAddress?.trim()) return false
  return sessionWallet.trim().toLowerCase() === connectedAddress.trim().toLowerCase()
}

/**
 * Effective governance identity.
 * Stellar/Soroban admin login is Freighter (session wallet); Privy may be disconnected.
 * Prefer the connected wallet when present, otherwise fall back to the session wallet.
 */
export function resolveGovernanceActorAddress(params: {
  connectedAddress: string | null | undefined
  sessionWallet: string | null | undefined
  /** When true (Soroban / Stellar Testnet), allow session-wallet-only signing. */
  allowSessionWalletFallback?: boolean
}): string | null {
  const connected = params.connectedAddress?.trim() || null
  if (connected) return connected
  if (params.allowSessionWalletFallback) {
    const session = params.sessionWallet?.trim() || null
    if (session) return session
  }
  return null
}
