/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WalletConnect / Reown Cloud project id — enables Ledger & QR-based wallets */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string
  /** API root including `/api`, e.g. http://127.0.0.1:8000/api — see http://127.0.0.1:8000/redoc/ */
  readonly VITE_API_BASE_URL?: string
  /** Privy App ID (public) */
  readonly VITE_PRIVY_APP_ID?: string
  /** Public Circle Web SDK app id. Circle API secrets must stay on the server. */
  readonly VITE_CIRCLE_APP_ID?: string
  /** Set `true` to show Connect Circle Wallet (disabled in local/Anvil mode). */
  readonly VITE_CIRCLE_WALLET_ENABLED?: string
  /** Google OAuth Web Client ID for Circle social login (Configurator + this env). */
  readonly VITE_CIRCLE_GOOGLE_CLIENT_ID?: string
  /** Facebook App ID for Circle social login. */
  readonly VITE_CIRCLE_FACEBOOK_APP_ID?: string
  /** JSON string of Firebase web config for Circle Apple social login. */
  readonly VITE_CIRCLE_APPLE_FIREBASE_CONFIG?: string
  /**
   * Privy App Secret (DO NOT use in frontend).
   * NOTE: Any `VITE_*` env var is bundled into client builds.
   */
  readonly VITE_PRIVY_APP_SECRET?: string
  /**
   * Google OAuth Web Client ID (public). Optional — copy the same value into the Privy dashboard
   * for custom Google credentials; the Privy SDK does not read this at runtime.
   */
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID?: string
  /** @deprecated Use `VITE_GOOGLE_OAUTH_CLIENT_ID` — same Google Web Client ID for Privy dashboard */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_AUTH_EIP712_DOMAIN_NAME?: string
  readonly VITE_AUTH_EIP712_DOMAIN_VERSION?: string
  readonly VITE_AUTH_EIP712_VERIFYING_CONTRACT?: `0x${string}`
  /**
   * Smart contract network preference.
   * Deployed apps support Arbitrum One, Sepolia, and Arc Testnet from the wallet.
   * `local` pins Anvil-only. `testnet`/`mainnet` are legacy defaults for Privy defaultChain only.
   * Arc Testnet is wallet-selectable and is not this env default.
   */
  readonly VITE_CONTRACT_NETWORK?: 'local' | 'testnet' | 'mainnet'
  /** Local Anvil RPC URL when `VITE_CONTRACT_NETWORK=local`. Default: http://127.0.0.1:8545 */
  readonly VITE_LOCAL_RPC_URL?: string
  /** Local chain id when `VITE_CONTRACT_NETWORK=local`. Overrides `local-deployment-config.json`. */
  readonly VITE_LOCAL_CHAIN_ID?: string
  /** Optional block explorer for local mode (usually empty). */
  readonly VITE_LOCAL_BLOCK_EXPLORER_URL?: string
  /** Arbitrum One JSON-RPC URL for public client reads when on mainnet. */
  readonly VITE_MAINNET_RPC_URL?: string
  /** Arc Testnet JSON-RPC URL. Default: https://rpc.testnet.arc.io */
  readonly VITE_ARC_TESTNET_RPC_URL?: string
  /** Arc Testnet block explorer origin. Default: https://testnet.arcscan.app */
  readonly VITE_ARC_TESTNET_BLOCK_EXPLORER_URL?: string
  readonly VITE_ARBITRUM_SEPOLIA_BLOCK_EXPLORER_URL?: string
  readonly VITE_ARBITRUM_SEPOLIA_POOL_CONTRACT_ADDRESS?: string
  /** Arbitrum One block explorer origin. Default: https://arbiscan.io */
  readonly VITE_ARBITRUM_BLOCK_EXPLORER_URL?: string
  /** @deprecated Use `VITE_ARBITRUM_SEPOLIA_BLOCK_EXPLORER_URL` */
  readonly VITE_ETH_SEPOLIA_BLOCK_EXPLORER_URL?: string
  /** @deprecated Use `VITE_ARBITRUM_SEPOLIA_POOL_CONTRACT_ADDRESS` */
  readonly VITE_ETH_SEPOLIA_POOL_CONTRACT_ADDRESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
