import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { fetchAdminLatestRepayments } from '@/api/adminLoan'
import { rejectUserFacing } from '@/errors/rejectUserFacing'
import {
  fetchAdminMetrics,
  fetchAdminOriginatedPrincipalHistory,
  fetchAdminTvlHistory,
  type AdminChartHistory,
  type AdminMetrics,
} from '@/api/metrics'
import {
  adminMetricsToMetricCards,
  adminRepaymentsToActivityRows,
  PLACEHOLDER_ADMIN_METRIC_CARDS,
} from '@/utils/mapAdminMetricsOverview'

export type AdminMetricCard = {
  title: string
  value: string
  iconSrc: string
  iconClass?: string
}

export type AdminActivityRow = {
  title: string
  subtitle: string
  date: string
  iconSrc: string
  iconBgClass: string
}

export type AdminDashboardSyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

export type AdminDashboardState = {
  metricCards: AdminMetricCard[]
  activities: AdminActivityRow[]
  adminMetrics: AdminMetrics | null
  tvlHistory: AdminChartHistory | null
  originatedHistory: AdminChartHistory | null
  status: AdminDashboardSyncStatus
  error: string | null
  lastUpdated: number | null
}

const initialState: AdminDashboardState = {
  metricCards: PLACEHOLDER_ADMIN_METRIC_CARDS,
  activities: [],
  adminMetrics: null,
  tvlHistory: null,
  originatedHistory: null,
  status: 'idle',
  error: null,
  lastUpdated: null,
}

type RefreshAdminAuth = {
  auth?: { accessToken?: string | null }
}

export type RefreshAdminDashboardArg = {
  /** Quiet refresh — do not flip status to loading (avoids sync overlay). */
  background?: boolean
}

function isBackgroundRefresh(arg: RefreshAdminDashboardArg | undefined): boolean {
  return Boolean(arg?.background)
}

export const refreshAdminDashboard = createAsyncThunk(
  'adminDashboard/refresh',
  async (_arg: RefreshAdminDashboardArg | undefined, thunkApi) => {
    const state = thunkApi.getState() as RefreshAdminAuth
    const accessToken = state.auth?.accessToken
    if (!accessToken?.trim()) {
      throw new Error('Sign in to load admin dashboard metrics.')
    }

    try {
      const [adminMetrics, tvlHistory, originatedHistory, repayments] = await Promise.all([
        fetchAdminMetrics(accessToken),
        fetchAdminTvlHistory(accessToken, { months: 7 }).catch(() => null),
        fetchAdminOriginatedPrincipalHistory(accessToken, { months: 7 }).catch(() => null),
        fetchAdminLatestRepayments(accessToken, { limit: 10 }).catch(() => []),
      ])

      return {
        refreshedAt: Date.now(),
        adminMetrics,
        tvlHistory,
        originatedHistory,
        metricCards: adminMetricsToMetricCards(adminMetrics),
        activities: adminRepaymentsToActivityRows(repayments),
      }
    } catch (e) {
      return thunkApi.rejectWithValue(rejectUserFacing(e, 'Could not load admin dashboard.'))
    }
  },
)

const adminDashboardSlice = createSlice({
  name: 'adminDashboard',
  initialState,
  reducers: {
    setAdminMetricValue: (
      state,
      action: PayloadAction<{ index: number; value: string }>,
    ) => {
      const { index, value } = action.payload
      const card = state.metricCards[index]
      if (card) card.value = value
    },
    setAdminActivities: (state, action: PayloadAction<AdminActivityRow[]>) => {
      state.activities = action.payload
    },
    resetAdminDashboard: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(refreshAdminDashboard.pending, (state, action) => {
        if (isBackgroundRefresh(action.meta.arg)) return
        state.status = 'loading'
        state.error = null
      })
      .addCase(refreshAdminDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.lastUpdated = action.payload.refreshedAt
        state.adminMetrics = action.payload.adminMetrics
        state.tvlHistory = action.payload.tvlHistory
        state.originatedHistory = action.payload.originatedHistory
        state.metricCards = action.payload.metricCards
        state.activities = action.payload.activities
      })
      .addCase(refreshAdminDashboard.rejected, (state, action) => {
        if (isBackgroundRefresh(action.meta.arg) && state.status === 'succeeded') {
          return
        }
        state.status = 'failed'
        state.error =
          (typeof action.payload === 'string' ? action.payload : null) ??
          action.error.message ??
          'Could not load dashboard metrics.'
      })
  },
})

export const { setAdminMetricValue, setAdminActivities, resetAdminDashboard } =
  adminDashboardSlice.actions
export const adminDashboardReducer = adminDashboardSlice.reducer
