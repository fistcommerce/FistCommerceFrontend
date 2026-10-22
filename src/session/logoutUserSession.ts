import type { ConnectedWallet } from '@privy-io/react-auth'

import type { AppDispatch } from '@/store'
import {
  disconnectPrivySession,
  type DisconnectPrivyOptions,
} from '@/session/disconnectPrivySession'
import { resetUserSession } from '@/session/resetUserSession'

const CHOOSE_ROLE_PATH = '/onboarding/choose-role'

/** Clears user auth, wallet mirror, onboarding state, and redirects to role selection. */
export async function logoutUserSession(
  dispatch: AppDispatch,
  wallet: ConnectedWallet | null,
  logout: (() => Promise<void>) | undefined,
  options?: DisconnectPrivyOptions,
): Promise<void> {
  resetUserSession(dispatch)
  try {
    await disconnectPrivySession(wallet, logout, options)
  } catch {
    /* still redirect — app session already cleared */
  }

  const { persistor } = await import('@/store')
  await persistor.flush()
  window.location.assign(CHOOSE_ROLE_PATH)
}
