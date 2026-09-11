import './polyfills'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider, type PrivyClientConfig } from '@privy-io/react-auth'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import App from './App.tsx'
import { isLocalOnlyDeployMode } from '@/contract_config/contractNetwork'
import {
  DEFAULT_APP_CHAIN,
  getSupportedAppChains,
  LOCAL_CHAIN,
} from '@/wallet/appChain'
import WalletReduxSync from '@/components/session/WalletReduxSync'
import { CircleWalletProvider } from '@/circle/CircleWalletProvider'
import AuthStorageSync from '@/store/AuthStorageSync'
import FullPageLoading from '@/components/app/FullPageLoading'
import { persistor, store } from '@/store'

import '@fontsource/outfit';
import './index.css'
const queryClient = new QueryClient()
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID
/** Same value you paste into Privy → Login methods → Google (custom credentials). Public only. */
const googleOauthClientIdForDocs =
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim() || import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

if (import.meta.env.DEV && !googleOauthClientIdForDocs) {
  console.info(
    '[Privy] Set VITE_GOOGLE_OAUTH_CLIENT_ID in .env to match the Google Web Client ID you configure in the Privy dashboard. The React SDK does not load OAuth secrets from the frontend.',
  )
}

const supportedChains = [...getSupportedAppChains()]

if (import.meta.env.DEV) {
  console.info(
    `[contracts] supported chains: ${supportedChains.map((c) => `${c.name} (${c.id})`).join(', ')}${
      isLocalOnlyDeployMode() ? ` @ ${LOCAL_CHAIN.rpcUrls.default.http[0]}` : ''
    }`,
  )
}

const privyConfig: PrivyClientConfig = {
  /** Embedded wallets initialize here; must be listed in `supportedChains` (Privy docs). */
  defaultChain: DEFAULT_APP_CHAIN,
  supportedChains,
  loginMethods: ['email', 'google', 'wallet'],
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
  externalWallets: {
    walletConnect: { enabled: true },
  },
  appearance: {
    walletList: [
      'detected_ethereum_wallets',
      'metamask',
      'coinbase_wallet',
      'rainbow',
      'wallet_connect',
      'phantom',
    ],
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<FullPageLoading label="Restoring your session…" />} persistor={persistor}>
        <AuthStorageSync />
        <PrivyProvider appId={privyAppId ?? ''} config={privyConfig}>
          <CircleWalletProvider>
            <QueryClientProvider client={queryClient}>
              <WalletReduxSync />
              <App />
            </QueryClientProvider>
          </CircleWalletProvider>
        </PrivyProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>,
)
