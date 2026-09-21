import { isSessionBootstrapping } from '@/access/sessionAccess'
import type { AccessCapabilities, AccessContext, AccessDecision } from '@/access/types'
import {
  ADMIN_DASHBOARD_OVERVIEW_PATH,
  ADMIN_LOGIN_PATH,
  isAdminSession,
  isAdminDashboardPath,
  isAdminLoginPath,
} from '@/auth/adminSession'
import { isUsableApiAccessToken } from '@/auth/accessTokenPolicy'
import type { UserRole } from '@/store/slices/authSlice'

function isKycFullyVerified(ctx: AccessContext): boolean {
  return ctx.kycFinancialAccess
}

/**
 * Central rules for “full” vs limited product access (no route strings here).
 */
export function evaluateCapabilities(ctx: AccessContext): AccessCapabilities {
  const verified = isKycFullyVerified(ctx)
  return {
    canUseInvestActions: verified,
    canUseMerchantLoanActions: verified,
    canUseMerchantRepayActions: verified,
  }
}

const ONBOARDING_CHOOSE_ROLE = '/onboarding/choose-role'

const INVESTOR_STEPS = [
  ONBOARDING_CHOOSE_ROLE,
  '/onboarding/investor/connect-wallet',
  '/onboarding/investor/verify-identity',
  '/onboarding/investor/investment-explainer',
] as const

const MERCHANT_STEPS = [
  ONBOARDING_CHOOSE_ROLE,
  '/onboarding/merchant/connect-wallet',
  '/onboarding/merchant/verify-identity',
  '/onboarding/merchant/business-profile',
] as const

/** Steps whose forms set `onboardingStepDirty` — used to block forward URL jumps with unsaved edits. */
const INVESTOR_FORM_DIRTY_STEPS = [2] as const
const MERCHANT_FORM_DIRTY_STEPS = [2, 3] as const

function stepDirty(ctx: AccessContext, role: 'investor' | 'merchant', stepIndex: number): boolean {
  const map = role === 'merchant' ? ctx.onboardingStepDirty.merchant : ctx.onboardingStepDirty.investor
  return Boolean(map[String(stepIndex)])
}

function firstBlockingDirtyStepForward(
  ctx: AccessContext,
  role: 'investor' | 'merchant',
  targetIdx: number,
): number | null {
  const tracked = role === 'merchant' ? MERCHANT_FORM_DIRTY_STEPS : INVESTOR_FORM_DIRTY_STEPS
  let block: number | null = null
  for (const k of tracked) {
    if (k < targetIdx && stepDirty(ctx, role, k)) {
      if (block === null || k < block) block = k
    }
  }
  return block
}

function onboardingIndex(pathname: string, role: 'investor' | 'merchant'): number {
  const routes = role === 'investor' ? INVESTOR_STEPS : MERCHANT_STEPS
  const i = routes.findIndex((r) => pathname === r || pathname.startsWith(`${r}/`))
  return i < 0 ? 0 : i
}

/**
 * Prevent skipping onboarding steps via direct URL.
 */
export function evaluateOnboardingPath(ctx: AccessContext): AccessDecision {
  // Avoid redirects while redux-persist is still restoring state (prevents flicker / wrong role decisions).
  if (!ctx.persistedReady) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (!pathnameIsOnboarding(ctx.pathname)) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (
    ctx.pathname === ONBOARDING_CHOOSE_ROLE ||
    ctx.pathname.startsWith(`${ONBOARDING_CHOOSE_ROLE}/`)
  ) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  /** Selected role (choose-role) must match the onboarding branch in the URL. */
  if (ctx.pathname.includes('/onboarding/investor/') && ctx.role !== 'investor') {
    return { allowed: false, redirectTo: ONBOARDING_CHOOSE_ROLE, reason: 'role_mismatch' }
  }
  if (ctx.pathname.includes('/onboarding/merchant/') && ctx.role !== 'merchant') {
    return { allowed: false, redirectTo: ONBOARDING_CHOOSE_ROLE, reason: 'role_mismatch' }
  }

  const role = roleForOnboardingPath(ctx)
  const max = role === 'merchant' ? ctx.onboardingMaxStep.merchant : ctx.onboardingMaxStep.investor
  const idx = onboardingIndex(ctx.pathname, role)

  if (idx > max) {
    const routes = role === 'merchant' ? MERCHANT_STEPS : INVESTOR_STEPS
    return {
      allowed: false,
      redirectTo: routes[Math.min(max, routes.length - 1)],
      reason: 'onboarding_step',
    }
  }

  const dirtyBlock = firstBlockingDirtyStepForward(ctx, role, idx)
  if (dirtyBlock !== null) {
    const routes = role === 'merchant' ? MERCHANT_STEPS : INVESTOR_STEPS
    return {
      allowed: false,
      redirectTo: routes[dirtyBlock],
      reason: 'onboarding_step',
    }
  }

  return { allowed: true, redirectTo: null, reason: 'ok' }
}

function roleForOnboardingPath(ctx: AccessContext): UserRole {
  if (ctx.pathname.includes('/onboarding/merchant/')) return 'merchant'
  if (ctx.pathname.includes('/onboarding/investor/')) return 'investor'
  return ctx.role ?? 'investor'
}

function pathnameIsOnboarding(pathname: string) {
  return (
    pathname === ONBOARDING_CHOOSE_ROLE ||
    pathname.startsWith(`${ONBOARDING_CHOOSE_ROLE}/`) ||
    pathname.startsWith('/onboarding/investor/') ||
    pathname.startsWith('/onboarding/merchant/')
  )
}

/**
 * Admin dashboard: only users with an admin session token (not investor/merchant API tokens).
 */
export function evaluateAdminDashboardSession(ctx: AccessContext): AccessDecision {
  if (!isAdminDashboardPath(ctx.pathname)) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (!ctx.persistedReady) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  // Modal owns UX; keep admin on this route until Log in again → /admin/login.
  if (ctx.sessionExpired && (ctx.sessionKind === 'admin' || isAdminDashboardPath(ctx.pathname))) {
    return { allowed: false, redirectTo: null, reason: 'session_expired' }
  }

  if (!isAdminSession(ctx.accessToken, ctx.sessionKind)) {
    return {
      allowed: false,
      redirectTo: ADMIN_LOGIN_PATH,
      reason: 'admin_required',
    }
  }

  return { allowed: true, redirectTo: null, reason: 'ok' }
}

/** Admin login page: already signed in as admin → overview. */
export function evaluateAdminLoginPath(ctx: AccessContext): AccessDecision {
  if (!isAdminLoginPath(ctx.pathname)) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (!ctx.persistedReady) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (isAdminSession(ctx.accessToken, ctx.sessionKind)) {
    return {
      allowed: false,
      redirectTo: ADMIN_DASHBOARD_OVERVIEW_PATH,
      reason: 'ok',
    }
  }

  return { allowed: true, redirectTo: null, reason: 'ok' }
}

/**
 * Dashboard shell: onboarded users need wallet + token for investor/merchant areas.
 */
export function evaluateDashboardSession(ctx: AccessContext): AccessDecision {
  if (!ctx.pathname.startsWith('/dashboard/')) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (!ctx.persistedReady) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (isAdminDashboardPath(ctx.pathname)) {
    if (!isAdminSession(ctx.accessToken, ctx.sessionKind)) {
      return {
        allowed: false,
        redirectTo: ADMIN_LOGIN_PATH,
        reason: 'admin_required',
      }
    }
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (isAdminSession(ctx.accessToken, ctx.sessionKind)) {
    return {
      allowed: false,
      redirectTo: ADMIN_DASHBOARD_OVERVIEW_PATH,
      reason: 'admin_session_only',
    }
  }

  // Modal owns UX; do not soft-navigate to onboarding while sessionExpired is set.
  if (ctx.sessionExpired) {
    return { allowed: false, redirectTo: null, reason: 'session_expired' }
  }

  // Wait for Privy before treating a persisted token as a missing wallet.
  if (
    isSessionBootstrapping(ctx) &&
    ctx.onboarded &&
    ctx.role &&
    isUsableApiAccessToken(ctx.accessToken)
  ) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (!ctx.onboarded) {
    return {
      allowed: false,
      redirectTo: ONBOARDING_CHOOSE_ROLE,
      reason: 'not_onboarded',
    }
  }

  if (!ctx.role) {
    return {
      allowed: false,
      redirectTo: ONBOARDING_CHOOSE_ROLE,
      reason: 'not_onboarded',
    }
  }

  if (!ctx.walletConnected || !ctx.walletAddress) {
    // Token owns the session. Privy/wallet idle must not kick an onboarded user to onboarding.
    if (isUsableApiAccessToken(ctx.accessToken)) {
      return { allowed: true, redirectTo: null, reason: 'ok' }
    }
    return {
      allowed: false,
      redirectTo: `/onboarding/${ctx.role}/connect-wallet`,
      reason: 'no_wallet',
    }
  }

  if (!isUsableApiAccessToken(ctx.accessToken)) {
    return {
      allowed: false,
      redirectTo: `/onboarding/${ctx.role}/connect-wallet`,
      reason: 'no_token',
    }
  }

  return { allowed: true, redirectTo: null, reason: 'ok' }
}

export function evaluateInvestorFinancialRoute(pathname: string, ctx: AccessContext): AccessDecision {
  const poolInvest = /\/dashboard\/investor\/lending-pool\/[^/]+\/invest\/?$/.test(pathname)
  const poolWithdraw = /\/dashboard\/investor\/lending-pool\/[^/]+\/withdraw\/?$/.test(pathname)
  const investorBridge = /\/dashboard\/investor\/bridge(?:\/|$)/.test(pathname)
  if (!poolInvest && !poolWithdraw && !investorBridge) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  const caps = evaluateCapabilities(ctx)
  if (caps.canUseInvestActions) return { allowed: true, redirectTo: null, reason: 'ok' }

  return {
    allowed: false,
    redirectTo: '/dashboard/investor/overview',
    reason: 'kyc_required',
  }
}

export function evaluateMerchantFinancialRoute(pathname: string, ctx: AccessContext): AccessDecision {
  const applyLoan = /\/dashboard\/merchant\/lending-pool\/[^/]+\/apply-loan\/?$/.test(pathname)
  const applySuccess = /\/dashboard\/merchant\/lending-pool\/[^/]+\/apply-loan\/success\/?$/.test(pathname)
  const applyFailure = /\/dashboard\/merchant\/lending-pool\/[^/]+\/apply-loan\/failure\/?$/.test(pathname)
  const repay = /\/dashboard\/merchant\/receivables\/[^/]+\/repay/.test(pathname)
  const merchantBridge = /\/dashboard\/merchant\/bridge(?:\/|$)/.test(pathname)

  if (!applyLoan && !applySuccess && !applyFailure && !repay && !merchantBridge) {
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  const caps = evaluateCapabilities(ctx)
  if (repay || merchantBridge) {
    if (!caps.canUseMerchantRepayActions) {
      return { allowed: false, redirectTo: '/dashboard/merchant/overview', reason: 'kyc_required' }
    }
    return { allowed: true, redirectTo: null, reason: 'ok' }
  }

  if (!caps.canUseMerchantLoanActions) {
    return { allowed: false, redirectTo: '/dashboard/merchant/overview', reason: 'kyc_required' }
  }

  return { allowed: true, redirectTo: null, reason: 'ok' }
}
