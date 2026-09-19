import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type FundingHopPhase =
  | 'idle'
  | 'switching_source'
  | 'bridging'
  | 'switching_arc'
  | 'depositing'

export type FundingHopState = {
  active: boolean
  phase: FundingHopPhase
  /** Fist login / deposit destination chain (usually Arc). */
  sessionChainId: number
  /** Frozen Arc (session) address — CCTP mint recipient + post-hop signer. */
  sessionWallet: string
  hopChainId: number | null
  purpose: 'deposit' | 'repayment' | null
}

export type WalletSliceState = {
  /** Mirrors Privy-selected active wallet; not persisted */
  isConnected: boolean
  address: string | null
  chainId: number | undefined
  /** True while a wallet write (approve / deposit / repay) is in flight. */
  writePending: boolean
  /**
   * True while a multi-step wallet action is in flight (Circle PIN/challenge,
   * CCTP bridge hops, or invest/repay confirm that temporarily leaves auth.chainId).
   */
  actionPending: boolean
  /**
   * Deposit/repay-scoped Circle (or CCTP) chain hop. Does not rewrite auth.*;
   * gates logout / wrong-network while the live wallet address/chain differs.
   */
  fundingHop: FundingHopState | null
}

const initialState: WalletSliceState = {
  isConnected: false,
  address: null,
  chainId: undefined,
  writePending: false,
  actionPending: false,
  fundingHop: null,
}

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    setWalletFromProvider: (
      state,
      action: PayloadAction<{ isConnected: boolean; address: string | null; chainId: number | undefined }>,
    ) => {
      state.isConnected = action.payload.isConnected
      state.address = action.payload.address
      state.chainId = action.payload.chainId
    },
    setWalletWritePending: (state, action: PayloadAction<boolean>) => {
      state.writePending = action.payload
    },
    setWalletActionPending: (state, action: PayloadAction<boolean>) => {
      state.actionPending = action.payload
    },
    beginFundingHop: (
      state,
      action: PayloadAction<{
        sessionChainId: number
        sessionWallet: string
        hopChainId: number | null
        purpose: 'deposit' | 'repayment'
        phase?: FundingHopPhase
      }>,
    ) => {
      state.fundingHop = {
        active: true,
        phase: action.payload.phase ?? 'switching_source',
        sessionChainId: action.payload.sessionChainId,
        sessionWallet: action.payload.sessionWallet,
        hopChainId: action.payload.hopChainId,
        purpose: action.payload.purpose,
      }
    },
    setFundingHopPhase: (state, action: PayloadAction<FundingHopPhase>) => {
      if (state.fundingHop?.active) {
        state.fundingHop.phase = action.payload
      }
    },
    endFundingHop: (state) => {
      state.fundingHop = null
    },
    resetWallet: () => initialState,
  },
})

export const {
  setWalletFromProvider,
  setWalletWritePending,
  setWalletActionPending,
  beginFundingHop,
  setFundingHopPhase,
  endFundingHop,
  resetWallet,
} = walletSlice.actions
export const walletReducer = walletSlice.reducer
