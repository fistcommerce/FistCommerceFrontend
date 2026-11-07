import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type WalletConnector = 'evm' | 'stellar'

export type WalletSliceState = {
  /** Mirrors Privy (evm) or Stellar Wallet Kit connection; not persisted */
  isConnected: boolean
  address: string | null
  chainId: number | undefined
  /** Which adapter owns the active connection. */
  connector: WalletConnector | null
  /** True while a wallet write (approve / deposit / repay) is in flight. */
  writePending: boolean
}

const initialState: WalletSliceState = {
  isConnected: false,
  address: null,
  chainId: undefined,
  connector: null,
  writePending: false,
}

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    setWalletFromProvider: (
      state,
      action: PayloadAction<{
        isConnected: boolean
        address: string | null
        chainId: number | undefined
        connector?: WalletConnector | null
      }>,
    ) => {
      state.isConnected = action.payload.isConnected
      state.address = action.payload.address
      state.chainId = action.payload.chainId
      if (action.payload.connector !== undefined) {
        state.connector = action.payload.connector
      } else if (!action.payload.isConnected) {
        state.connector = null
      } else if (!state.connector) {
        state.connector = 'evm'
      }
    },
    setWalletWritePending: (state, action: PayloadAction<boolean>) => {
      state.writePending = action.payload
    },
    resetWallet: () => initialState,
  },
})

export const { setWalletFromProvider, setWalletWritePending, resetWallet } = walletSlice.actions
export const walletReducer = walletSlice.reducer
