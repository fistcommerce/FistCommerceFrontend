import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type WalletSliceState = {
  /** Mirrors Privy-selected active wallet; not persisted */
  isConnected: boolean
  address: string | null
  chainId: number | undefined
  /** True while a wallet write (approve / deposit / repay) is in flight. */
  writePending: boolean
  /** True while a Circle PIN/challenge (including login) is in flight. */
  actionPending: boolean
}

const initialState: WalletSliceState = {
  isConnected: false,
  address: null,
  chainId: undefined,
  writePending: false,
  actionPending: false,
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
    resetWallet: () => initialState,
  },
})

export const { setWalletFromProvider, setWalletWritePending, setWalletActionPending, resetWallet } =
  walletSlice.actions
export const walletReducer = walletSlice.reducer
