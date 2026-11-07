import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import { fetchMerchantLoanList, type MerchantLoanListEntry } from '@/api/loanDetails'
import { rejectUserFacing } from '@/errors/rejectUserFacing'
import type { RootState } from '@/store'
import { selectIsKycVerified } from '@/store/selectors/sessionSelectors'

export type MerchantReceivablesStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

export type MerchantReceivablesState = {
  loans: MerchantLoanListEntry[]
  status: MerchantReceivablesStatus
  error: string | null
  lastUpdated: number | null
}

const initialState: MerchantReceivablesState = {
  loans: [],
  status: 'idle',
  error: null,
  lastUpdated: null,
}

export type RefreshMerchantReceivablesArg = {
  /** Quiet refresh — do not flip status to loading. */
  background?: boolean
}

function isBackgroundRefresh(arg: RefreshMerchantReceivablesArg | undefined): boolean {
  return Boolean(arg?.background)
}

export const refreshMerchantReceivables = createAsyncThunk(
  'merchantReceivables/refresh',
  async (_arg: RefreshMerchantReceivablesArg | undefined, thunkApi) => {
    const state = thunkApi.getState() as RootState
    const accessToken = state.auth?.accessToken?.trim()
    if (!isUsableApiAccessToken(accessToken)) {
      return { fetchedAt: Date.now(), loans: [] as MerchantLoanListEntry[] }
    }

    // Only fully verified merchants (reviewed + kyc_verified + insurance_verified) may call GET /api/loan/request.
    if (!selectIsKycVerified(state)) {
      return { fetchedAt: Date.now(), loans: [] as MerchantLoanListEntry[] }
    }

    try {
      const loans = await fetchMerchantLoanList(accessToken)
      return { fetchedAt: Date.now(), loans }
    } catch (e) {
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not load receivables.'))
    }
  },
)

const merchantReceivablesSlice = createSlice({
  name: 'merchantReceivables',
  initialState,
  reducers: {
    clearMerchantReceivables: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshMerchantReceivables.pending, (state, action) => {
        if (!isBackgroundRefresh(action.meta.arg)) {
          state.status = 'loading'
        }
        state.error = null
      })
      .addCase(refreshMerchantReceivables.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.loans = action.payload?.loans ?? []
        state.lastUpdated = action.payload?.fetchedAt ?? Date.now()
      })
      .addCase(refreshMerchantReceivables.rejected, (state, action) => {
        state.status = 'failed'
        state.error =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not load receivables.'
      })
  },
})

export const { clearMerchantReceivables } = merchantReceivablesSlice.actions
export const merchantReceivablesReducer = merchantReceivablesSlice.reducer
