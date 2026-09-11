import type { AppWallet } from '@/wallet/appWallet'

import type { AppDispatch } from '@/store'
import { disconnectPrivySession } from '@/session/disconnectPrivySession'
import { resetUserSession } from '@/session/resetUserSession'

const CHOOSE_ROLE_PATH = '/onboarding/choose-role'

/** Clears user auth, wallet mirror, onboarding state, and redirects to role selection. */
export async function logoutUserSession(
  dispatch: AppDispatch,
  wallet: AppWallet | null,
  logout: (() => Promise<void>) | undefined,
): Promise<void> {
  resetUserSession(dispatch)
  await disconnectPrivySession(wallet, logout)

  const { persistor } = await import('@/store')
  await persistor.flush()
  window.location.assign(CHOOSE_ROLE_PATH)
}
