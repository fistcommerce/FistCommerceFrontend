import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import type { AdminWriteOutcome } from '@/api/adminActionResponse'
import { isProposalQueuedOutcome } from '@/admin/governance/types'
import {
  fetchAdminLoanMonitoringDetail,
  fetchAdminLoanMonitoringList,
  postAdminFundLoan,
  postAdminLoanReview,
  postAdminMarkLoanDefaulted,
  postAdminWriteOffLoanShortfall,
  type AdminLoanMonitoringCounts,
  type AdminLoanMonitoringRow,
  type AdminLoanMonitoringTabFilter,
} from '@/api/adminLoanMonitoring'
import { postRejectDisbursementRequest } from '@/api/adminRequests'
import { fetchReceivablePayoutStatus, postAdminPayoutInitiate } from '@/api/payout'
import { rejectUserFacing } from '@/errors/rejectUserFacing'
import type {
  AdminLoanMonitoringActionKind,
  LoanMonitoringDetailView,
} from '@/components/admin/loan-monitoring/types'
import { mapAdminLoanMonitoringDetailToView, isLoanLifecycleFundedOrLater } from '@/utils/mapAdminLoanMonitoringList'
import {
  adminLoanMonitoringListCacheKey,
  adminLoanMonitoringListsEqual,
} from '@/utils/adminLoanMonitoringListCache'
import { isAbortedThunkAction, isAbortError } from '@/utils/abortError'
import {
  isLatestAdminListRequest,
  markAdminListRequestPending,
  type AdminListRequestState,
} from '@/store/adminListRefresh'

export type AdminLoanMonitoringSyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed'
export type AdminLoanMonitoringDetailSyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed'
export type AdminLoanMonitoringActionStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

export type AdminLoanMonitoringState = AdminListRequestState & {
  counts: AdminLoanMonitoringCounts
  results: AdminLoanMonitoringRow[]
  resultsCache: Record<string, AdminLoanMonitoringRow[]>
  listRefreshing: boolean
  status: AdminLoanMonitoringSyncStatus
  error: string | null
  lastUpdated: number | null
  lastFilter: AdminLoanMonitoringTabFilter
  lastSearch: string
  detailStatus: AdminLoanMonitoringDetailSyncStatus
  detailError: string | null
  detailLoanId: string | null
  detailsByLoanId: Record<string, LoanMonitoringDetailView>
  actionStatus: AdminLoanMonitoringActionStatus
  actionError: string | null
  actionLoanId: string | null
  actionKind: AdminLoanMonitoringActionKind | null
  lastActionOutcome: AdminWriteOutcome | null
}

const emptyCounts: AdminLoanMonitoringCounts = {
  activeLoans: 0,
  latePaymentsAmount: '0.00',
  defaultedLoansAmount: '0.00',
  fullyRepaid: 0,
}

const initialState: AdminLoanMonitoringState = {
  listRequestId: null,
  counts: emptyCounts,
  results: [],
  resultsCache: {},
  listRefreshing: false,
  status: 'idle',
  error: null,
  lastUpdated: null,
  lastFilter: 'all',
  lastSearch: '',
  detailStatus: 'idle',
  detailError: null,
  detailLoanId: null,
  detailsByLoanId: {},
  actionStatus: 'idle',
  actionError: null,
  actionLoanId: null,
  actionKind: null,
  lastActionOutcome: null,
}

export type RefreshAdminLoanMonitoringParams = {
  status?: AdminLoanMonitoringTabFilter
  search?: string
  limit?: number
  offset?: number
  background?: boolean
}

export type RefreshAdminLoanMonitoringDetailParams = {
  loanId: string
}

export type AdminLoanMonitoringLoanActionParams = {
  loanId: string
}

export type AdminLoanMonitoringFundActionParams = {
  loanId: string
  receivableId: string
}

type RefreshAdminAuth = {
  auth?: { accessToken?: string | null }
  adminLoanMonitoring?: Pick<AdminLoanMonitoringState, 'detailsByLoanId'>
}

function lifecycleStatusFromMonitoringDetail(
  detail: Awaited<ReturnType<typeof fetchAdminLoanMonitoringDetail>>,
): string {
  const lifecycle = detail.details?.lifecycle
  if (lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)) {
    const status = (lifecycle as Record<string, unknown>).status
    if (typeof status === 'string' && status.trim()) return status.trim()
  }
  return ''
}

async function resolveLoanLifecycleStatusForAction(
  accessToken: string,
  loanId: string,
  state: RefreshAdminAuth,
  signal: AbortSignal,
): Promise<string> {
  const cached = state.adminLoanMonitoring?.detailsByLoanId[loanId]?.loanLifecycleStatus?.trim()
  if (cached) return cached

  const detail = await fetchAdminLoanMonitoringDetail(accessToken, loanId)
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return lifecycleStatusFromMonitoringDetail(detail)
}

function shouldRefreshLoanDetailAfterOutcome(outcome: AdminWriteOutcome): boolean {
  return outcome.kind === 'completed' || isProposalQueuedOutcome(outcome)
}

async function runLoanPrivilegedAction(
  loanId: string,
  run: (signal: AbortSignal) => Promise<AdminWriteOutcome>,
  thunkApi: { dispatch: (action: unknown) => { unwrap: () => Promise<unknown> }; signal: AbortSignal },
) {
  const outcome = await run(thunkApi.signal)
  if (thunkApi.signal.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  if (shouldRefreshLoanDetailAfterOutcome(outcome)) {
    await thunkApi.dispatch(refreshAdminLoanMonitoringDetail({ loanId })).unwrap()
  }
  return { loanId, outcome }
}

export const refreshAdminLoanMonitoring = createAsyncThunk(
  'adminLoanMonitoring/refresh',
  async (params: RefreshAdminLoanMonitoringParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to load loan monitoring data.')
    }

    const { background: _background, ...filterParams } = params
    const status = filterParams.status ?? 'all'
    const search = filterParams.search?.trim() ?? ''

    try {
      const data = await fetchAdminLoanMonitoringList(accessToken, {
        status,
        search: search || undefined,
        limit: filterParams.limit,
        offset: filterParams.offset,
      })
      return {
        fetchedAt: Date.now(),
        filter: { status, search, limit: filterParams.limit, offset: filterParams.offset },
        counts: data.counts,
        results: data.results,
      }
    } catch (e) {
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const refreshAdminLoanMonitoringDetail = createAsyncThunk(
  'adminLoanMonitoring/refreshDetail',
  async (params: RefreshAdminLoanMonitoringDetailParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to load loan detail.')
    }

    const loanId = params.loanId.trim()
    if (!loanId) {
      throw new Error('Missing loan id.')
    }

    try {
      const detail = await fetchAdminLoanMonitoringDetail(accessToken, loanId)
      const receivableRaw = detail.details?.receivable
      const receivableObj =
        receivableRaw && typeof receivableRaw === 'object' && !Array.isArray(receivableRaw)
          ? (receivableRaw as Record<string, unknown>)
          : null
      const receivableId =
        (typeof receivableObj?.receivableId === 'string' && receivableObj.receivableId.trim()) ||
        (typeof receivableObj?.receivable_id === 'string' && receivableObj.receivable_id.trim()) ||
        ''

      let payoutStatus = null
      if (receivableId) {
        try {
          payoutStatus = await fetchReceivablePayoutStatus(accessToken, receivableId, {
            signal: thunkApi.signal,
          })
        } catch {
          payoutStatus = null
        }
      }

      return {
        loanId,
        detail: mapAdminLoanMonitoringDetailToView(detail, { payoutStatus }),
      }
    } catch (e) {
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const approveAdminLoanMonitoringLoan = createAsyncThunk(
  'adminLoanMonitoring/approve',
  async (params: AdminLoanMonitoringLoanActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to approve this loan.')
    }

    const loanId = params.loanId.trim()
    if (!loanId) throw new Error('Missing loan id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        (signal) => postAdminLoanReview(accessToken, { loanId, status: 'verified' }, { signal }),
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      // Approve can land on-chain while the API still errors; refresh so gates/status heal.
      try {
        await thunkApi.dispatch(refreshAdminLoanMonitoringDetail({ loanId })).unwrap()
      } catch {
        // Keep the original approve error.
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const rejectAdminLoanMonitoringLoan = createAsyncThunk(
  'adminLoanMonitoring/reject',
  async (params: AdminLoanMonitoringLoanActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to reject this loan.')
    }

    const loanId = params.loanId.trim()
    if (!loanId) throw new Error('Missing loan id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        (signal) => postAdminLoanReview(accessToken, { loanId, status: 'rejected' }, { signal }),
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const fundAdminLoanMonitoringLoan = createAsyncThunk(
  'adminLoanMonitoring/fund',
  async (params: AdminLoanMonitoringFundActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to approve funding for this loan.')
    }

    const loanId = params.loanId.trim()
    const receivableId = params.receivableId.trim()
    if (!loanId) throw new Error('Missing loan id.')
    if (!receivableId) throw new Error('Missing receivable id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        (signal) => postAdminFundLoan(accessToken, receivableId, { signal }),
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const initiateAdminLoanMonitoringPayout = createAsyncThunk(
  'adminLoanMonitoring/initiatePayout',
  async (params: AdminLoanMonitoringFundActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to disburse funding to the merchant.')
    }

    const loanId = params.loanId.trim()
    const receivableId = params.receivableId.trim()
    if (!loanId) throw new Error('Missing loan id.')
    if (!receivableId) throw new Error('Missing receivable id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        async (signal) => {
          const lifecycleStatus = await resolveLoanLifecycleStatusForAction(
            accessToken,
            loanId,
            state,
            signal,
          )

          if (!isLoanLifecycleFundedOrLater(lifecycleStatus)) {
            const fundOutcome = await postAdminFundLoan(accessToken, receivableId, { signal })
            if (fundOutcome.kind !== 'completed') {
              return fundOutcome
            }
          }

          return postAdminPayoutInitiate(accessToken, receivableId, { signal })
        },
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const cancelFundingAdminLoanMonitoringLoan = createAsyncThunk(
  'adminLoanMonitoring/cancelFunding',
  async (params: AdminLoanMonitoringFundActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to cancel funding for this loan.')
    }

    const loanId = params.loanId.trim()
    const receivableId = params.receivableId.trim()
    if (!loanId) throw new Error('Missing loan id.')
    if (!receivableId) throw new Error('Missing receivable id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        (signal) => postRejectDisbursementRequest(accessToken, receivableId, { signal }),
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const markAdminLoanMonitoringLoanDefaulted = createAsyncThunk(
  'adminLoanMonitoring/markDefaulted',
  async (params: AdminLoanMonitoringLoanActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to mark this loan as defaulted.')
    }

    const loanId = params.loanId.trim()
    if (!loanId) throw new Error('Missing loan id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        (signal) => postAdminMarkLoanDefaulted(accessToken, loanId, { signal }),
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

export const writeOffAdminLoanMonitoringShortfall = createAsyncThunk(
  'adminLoanMonitoring/writeOffShortfall',
  async (params: AdminLoanMonitoringLoanActionParams, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to write off this loan shortfall.')
    }

    const loanId = params.loanId.trim()
    if (!loanId) throw new Error('Missing loan id.')

    try {
      return await runLoanPrivilegedAction(
        loanId,
        (signal) => postAdminWriteOffLoanShortfall(accessToken, loanId, { signal }),
        thunkApi,
      )
    } catch (e) {
      if (thunkApi.signal.aborted || isAbortError(e)) {
        throw e
      }
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not complete loan action.'))
    }
  },
)

function resetLoanActionOnAbort(
  state: AdminLoanMonitoringState,
  action: { meta: { aborted?: boolean } },
): boolean {
  if (!isAbortedThunkAction(action)) return false
  state.actionStatus = 'idle'
  state.actionError = null
  state.actionLoanId = null
  state.actionKind = null
  state.lastActionOutcome = null
  return true
}

const adminLoanMonitoringSlice = createSlice({
  name: 'adminLoanMonitoring',
  initialState,
  reducers: {
    resetAdminLoanMonitoring: () => initialState,
    clearAdminLoanMonitoringActionError: (state) => {
      state.actionStatus = 'idle'
      state.actionError = null
      state.actionLoanId = null
      state.actionKind = null
      state.lastActionOutcome = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshAdminLoanMonitoring.pending, (state, action) => {
        state.error = null
        markAdminListRequestPending(state, action.meta.requestId)

        const { background, ...filter } = action.meta.arg ?? {}
        const cacheKey = adminLoanMonitoringListCacheKey(filter)
        const hasCache = Object.prototype.hasOwnProperty.call(state.resultsCache, cacheKey)
        const cached = state.resultsCache[cacheKey] ?? []
        const nextStatus = filter.status ?? 'all'
        const nextSearch = filter.search?.trim() ?? ''
        const filterChanged = nextStatus !== state.lastFilter || nextSearch !== state.lastSearch
        const useBackground = Boolean(background) || hasCache

        if (filterChanged) {
          state.lastFilter = nextStatus
          state.lastSearch = nextSearch
          if (hasCache) {
            state.results = cached
            state.status = 'succeeded'
          } else {
            state.results = []
            state.status = 'loading'
          }
        } else if (useBackground) {
          state.listRefreshing = true
          return
        }

        if (useBackground) {
          state.listRefreshing = true
          return
        }

        state.status = 'loading'
        if (!hasCache) {
          state.results = []
        }
      })
      .addCase(refreshAdminLoanMonitoring.fulfilled, (state, action) => {
        if (!isLatestAdminListRequest(state, action.meta.requestId)) return

        state.listRefreshing = false
        state.status = 'succeeded'
        state.lastUpdated = action.payload.fetchedAt
        state.lastFilter = action.payload.filter.status
        state.lastSearch = action.payload.filter.search
        state.counts = action.payload.counts

        const cacheKey = adminLoanMonitoringListCacheKey(action.payload.filter)
        const incoming = action.payload.results
        state.resultsCache[cacheKey] = incoming

        if (!adminLoanMonitoringListsEqual(state.results, incoming)) {
          state.results = incoming
        }
      })
      .addCase(refreshAdminLoanMonitoring.rejected, (state, action) => {
        state.listRefreshing = false

        const { background, ...filter } = action.meta.arg ?? {}
        const cacheKey = adminLoanMonitoringListCacheKey(filter)
        const hasCache = Object.prototype.hasOwnProperty.call(state.resultsCache, cacheKey)

        if (Boolean(background) || hasCache || state.results.length > 0) {
          state.error =
            (typeof action.payload === 'string' ? action.payload : null) ??
            action.error.message ??
            'Could not refresh loan monitoring data.'
          return
        }

        state.status = 'failed'
        state.error =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not load loan monitoring data.'
      })
      .addCase(refreshAdminLoanMonitoringDetail.pending, (state, action) => {
        state.detailStatus = 'loading'
        state.detailError = null
        state.detailLoanId = action.meta.arg.loanId
      })
      .addCase(refreshAdminLoanMonitoringDetail.fulfilled, (state, action) => {
        state.detailStatus = 'succeeded'
        state.detailsByLoanId[action.payload.loanId] = action.payload.detail
      })
      .addCase(refreshAdminLoanMonitoringDetail.rejected, (state, action) => {
        state.detailStatus = 'failed'
        state.detailError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not load loan detail.'
      })
      .addCase(approveAdminLoanMonitoringLoan.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'approve'
        state.lastActionOutcome = null
      })
      .addCase(approveAdminLoanMonitoringLoan.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(approveAdminLoanMonitoringLoan.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
      .addCase(rejectAdminLoanMonitoringLoan.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'reject'
        state.lastActionOutcome = null
      })
      .addCase(rejectAdminLoanMonitoringLoan.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(rejectAdminLoanMonitoringLoan.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
      .addCase(fundAdminLoanMonitoringLoan.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'fund'
        state.lastActionOutcome = null
      })
      .addCase(fundAdminLoanMonitoringLoan.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(fundAdminLoanMonitoringLoan.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
      .addCase(initiateAdminLoanMonitoringPayout.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'initiatePayout'
        state.lastActionOutcome = null
      })
      .addCase(initiateAdminLoanMonitoringPayout.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(initiateAdminLoanMonitoringPayout.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
      .addCase(cancelFundingAdminLoanMonitoringLoan.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'cancelFunding'
        state.lastActionOutcome = null
      })
      .addCase(cancelFundingAdminLoanMonitoringLoan.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(cancelFundingAdminLoanMonitoringLoan.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
      .addCase(markAdminLoanMonitoringLoanDefaulted.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'markDefaulted'
        state.lastActionOutcome = null
      })
      .addCase(markAdminLoanMonitoringLoanDefaulted.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(markAdminLoanMonitoringLoanDefaulted.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
      .addCase(writeOffAdminLoanMonitoringShortfall.pending, (state, action) => {
        state.actionStatus = 'loading'
        state.actionError = null
        state.actionLoanId = action.meta.arg.loanId
        state.actionKind = 'writeOffShortfall'
        state.lastActionOutcome = null
      })
      .addCase(writeOffAdminLoanMonitoringShortfall.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded'
        state.actionError = null
        state.lastActionOutcome = action.payload.outcome
      })
      .addCase(writeOffAdminLoanMonitoringShortfall.rejected, (state, action) => {
        if (resetLoanActionOnAbort(state, action)) return
        state.actionStatus = 'failed'
        state.actionError =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not complete loan action.'
      })
  },
})

export const { resetAdminLoanMonitoring, clearAdminLoanMonitoringActionError } =
  adminLoanMonitoringSlice.actions
export const adminLoanMonitoringReducer = adminLoanMonitoringSlice.reducer

export function selectLoanMonitoringDetail(
  state: AdminLoanMonitoringState,
  loanId: string,
): LoanMonitoringDetailView | null {
  return state.detailsByLoanId[loanId] ?? null
}
