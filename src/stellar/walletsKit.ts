import logoUrl from '@/assets/logo.png'
import { STELLAR_TESTNET_CHAIN_ID } from '@/stellar/chain'
import {
  STELLAR_TEST_ASSET_CODE,
  STELLAR_TEST_ASSET_ISSUER,
  STELLAR_TESTNET_FRIENDBOT_URL,
  STELLAR_TESTNET_HORIZON_URL,
} from '@/stellar/testAsset'

type KitNs = typeof import('@creit.tech/stellar-wallets-kit')

type KitModule = {
  productId?: string
  isAvailable?: () => Promise<boolean>
}

/** True inside Varial/Freighter mobile in-app browser (kit expects WalletConnect there). */
function isVarialMobileWebView(): boolean {
  try {
    const stellar = (window as Window & { stellar?: { provider?: string; platform?: string } })
      .stellar
    return (
      stellar?.platform === 'mobile' &&
      (stellar.provider === 'varial' || stellar.provider === 'freighter')
    )
  } catch {
    return false
  }
}

async function waitForModuleAvailable(mod: KitModule | undefined, timeoutMs = 8000): Promise<void> {
  if (!mod?.isAvailable) return
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (await mod.isAvailable()) return
    } catch {
      /* keep waiting */
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

/** Initialize kit modules (Testnet) and return the kit namespace. */
export async function initAndGetKit(): Promise<KitNs> {
  return initStellarWalletsKit()
}

/** AppKit / SignClient must be created once — recreating WalletConnectModule breaks `modal.open`. */
let kitNsPromise: Promise<KitNs> | null = null

async function initStellarWalletsKit(): Promise<KitNs> {
  if (typeof window === 'undefined') {
    throw new Error('Stellar Wallets Kit is only available in the browser.')
  }

  if (!kitNsPromise) {
    kitNsPromise = (async () => {
      const mod = await import('@creit.tech/stellar-wallets-kit')
      const { AlbedoModule } = await import('@creit.tech/stellar-wallets-kit/modules/albedo')
      const { VarialModule } = await import('@creit.tech/stellar-wallets-kit/modules/varial')

      const { StellarWalletsKit, Networks } = mod
      const modules: KitModule[] = [new VarialModule(), new AlbedoModule()]
      const inVarialMobile = isVarialMobileWebView()

      // Varial mobile WebView marks VarialModule unavailable and requires WalletConnect
      // (see VarialModule.isAvailable — window.stellar.platform === "mobile").
      const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()
      if (wcProjectId) {
        const {
          WalletConnectModule,
          WalletConnectTargetChain,
        } = await import('@creit.tech/stellar-wallets-kit/modules/wallet-connect')
        const icon =
          typeof logoUrl === 'string' && logoUrl
            ? logoUrl.startsWith('http')
              ? logoUrl
              : new URL(logoUrl, window.location.origin).href
            : `${window.location.origin}/`
        const wcModule = new WalletConnectModule({
          projectId: wcProjectId,
          metadata: {
            name: 'Fist Commerce',
            description: 'Fist Commerce Stellar Testnet',
            url: window.location.origin,
            icons: [icon],
            redirect: {
              universal: window.location.origin,
            },
          },
          allowedChains: [WalletConnectTargetChain.TESTNET],
          appKitOptions: {
            // Stale WC sessions can leave AppKit on "Connecting…" forever.
            enableReconnect: false,
            // Inside Varial's in-app browser, featuring Varial triggers a deeplink that
            // never surfaces an approve sheet → stuck on "Connecting to your wallet…".
            // Prefer the QR / copy-URI path so the user can paste into Varial's scanner.
            ...(inVarialMobile
              ? {
                  featuredWalletIds: [],
                  allWallets: 'HIDE' as const,
                }
              : {}),
          } as never,
        }) as KitModule & {
          isPlatformWrapper?: () => Promise<boolean>
          getAddress?: () => Promise<{ address: string }>
          modal?: { open: (opts: { uri: string }) => void; close: () => void }
        }
        // Kit auth modal auto-selects any module with isPlatformWrapper===true and shows
        // "Connecting to your wallet using WalletConnect" with no QR — that hangs in
        // Varial's WebView. Force manual WalletConnect selection (QR / copy URI) instead.
        wcModule.isPlatformWrapper = async () => false
        // Ensure AppKit QR appears above the kit auth modal (kit uses a high fixed overlay).
        const modal = wcModule.modal
        if (modal && typeof modal.open === 'function') {
          const open = modal.open.bind(modal)
          modal.open = (opts: { uri: string }) => {
            console.info('[FistCommerce WC] AppKit open', { hasUri: Boolean(opts?.uri) })
            open(opts)
            // Bump AppKit host z-index after open so QR is not trapped under SWK.
            requestAnimationFrame(() => {
              document.querySelectorAll('w3m-modal, appkit-modal, wcm-modal').forEach((el) => {
                const node = el as HTMLElement
                node.style.zIndex = '2147483646'
                node.style.position = node.style.position || 'fixed'
              })
            })
          }
        }
        const origGetAddress = wcModule.getAddress?.bind(wcModule)
        if (origGetAddress) {
          wcModule.getAddress = async () => {
            console.info('[FistCommerce WC] getAddress start', {
              available: await wcModule.isAvailable?.(),
            })
            try {
              const result = await origGetAddress()
              console.info('[FistCommerce WC] getAddress ok')
              return result
            } catch (err) {
              console.error('[FistCommerce WC] getAddress failed', err)
              throw err
            }
          }
        }
        modules.unshift(wcModule)
      }

      // Wallets with signMessage (Stellar login): Varial/Freighter, WalletConnect, Albedo.
      StellarWalletsKit.init({
        network: Networks.TESTNET,
        modules: modules as never[],
        authModal: {
          // Inside Varial mobile, Varial extension is intentionally unavailable — hide Install noise.
          showInstallLabel: !inVarialMobile,
          hideUnsupportedWallets: inVarialMobile,
        },
      })
      StellarWalletsKit.setNetwork(Networks.TESTNET)

      // SignClient init is async; wait so refreshSupportedWallets doesn't mark WC unavailable
      // and the auth modal wrongly opens the WalletConnect homepage.
      const wcMod = modules.find((m) => m.productId === 'wallet_connect')
      await waitForModuleAvailable(wcMod)
      if (wcMod?.isAvailable && !(await wcMod.isAvailable())) {
        throw new Error(
          'WalletConnect failed to start. Check VITE_WALLETCONNECT_PROJECT_ID and that this site origin is allowed in the WalletConnect Cloud project.',
        )
      }

      return mod
    })().catch((err) => {
      // Allow a later retry if first init failed (e.g. transient relay error).
      kitNsPromise = null
      throw err
    })
  }

  const mod = await kitNsPromise
  // Reuse the same module / AppKit instances — recreating WalletConnectModule breaks modal.open.
  mod.StellarWalletsKit.setNetwork(mod.Networks.TESTNET)
  return mod
}

/** True when Freighter/Varial (or kit) reports Stellar Testnet. */
async function isWalletOnStellarTestnet(
  kit: KitNs['StellarWalletsKit'],
  Networks: KitNs['Networks'],
): Promise<{ ok: boolean; networkLabel: string }> {
  try {
    const { network, networkPassphrase } = await kit.getNetwork()
    const ok =
      String(network || '').toUpperCase() === 'TESTNET' ||
      networkPassphrase === Networks.TESTNET
    const networkLabel = network || networkPassphrase || 'unknown'
    return { ok, networkLabel }
  } catch {
    // Some wallets don't expose getNetwork; don't block connect.
    return { ok: true, networkLabel: 'unknown' }
  }
}

const WC_CONNECT_TIMEOUT_MS = 90_000

export async function connectStellarWalletViaKit(opts?: {
  /** Drop the prior kit session so the auth modal can pick a different wallet/account. */
  forceReselect?: boolean
}): Promise<{ address: string }> {
  const { StellarWalletsKit, Networks } = await initStellarWalletsKit()
  // Kit reuses the last selected wallet unless we disconnect first — needed for "Switch".
  if (opts?.forceReselect !== false) {
    try {
      await StellarWalletsKit.disconnect()
    } catch {
      /* ignore — nothing connected yet */
    }
  }
  // Prime wallet list before the modal paints.
  await StellarWalletsKit.refreshSupportedWallets()

  // WalletConnect approval can hang on "Connecting to your wallet…" (deeplink / no approve).
  // Bound the wait so the UI can unlock and the user can retry.
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const { address } = await Promise.race([
      StellarWalletsKit.authModal(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              'WalletConnect timed out while connecting. Close the modal, confirm Varial is on Test Net, then try again — or copy the WalletConnect URI into Varial’s scanner.',
            ),
          )
        }, WC_CONNECT_TIMEOUT_MS)
      }),
    ])
    const normalized = address.trim().toUpperCase()
    if (!normalized.startsWith('G') || normalized.length !== 56) {
      throw new Error('Stellar wallet did not return a valid account address.')
    }

    const { ok, networkLabel } = await isWalletOnStellarTestnet(StellarWalletsKit, Networks)
    if (!ok) {
      throw new Error(
        `Your Stellar wallet is on ${networkLabel}. Open Freighter/Varial → switch the network to Test Net, then connect again.`,
      )
    }
    return { address: normalized }
  } catch (e) {
    try {
      await StellarWalletsKit.disconnect()
    } catch {
      /* ignore */
    }
    throw e
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export async function disconnectStellarWalletKit(): Promise<void> {
  try {
    const { StellarWalletsKit } = await initStellarWalletsKit()
    await StellarWalletsKit.disconnect()
  } catch {
    /* ignore */
  }
}

/** Canonical login message string (must match backend `stellar_auth` reconstruction). */
export function buildStellarLoginMessage(params: {
  wallet: string
  issuedAt: number
  action: string
  nonce: string
  chainId?: number
}): string {
  const chainId = params.chainId ?? STELLAR_TESTNET_CHAIN_ID
  return [
    'FistCommerce Authentication',
    `wallet:${params.wallet}`,
    `issuedAt:${params.issuedAt}`,
    `action:${params.action}`,
    `nonce:${params.nonce}`,
    `chainId:${chainId}`,
  ].join('\n')
}

export async function signStellarLoginMessage(params: {
  wallet: string
  issuedAt: number
  action: string
  nonce: string
  chainId?: number
}): Promise<{ signature: string; message: string }> {
  const { StellarWalletsKit, Networks } = await initStellarWalletsKit()
  const message = buildStellarLoginMessage(params)

  // Prefer Test Net, but login signatures are network-agnostic (ed25519 over the message).
  // Passing Networks.TESTNET while Varial is on Main Net makes Freighter/Varial refuse to sign.
  const { ok, networkLabel } = await isWalletOnStellarTestnet(StellarWalletsKit, Networks)
  if (!ok) {
    throw new Error(
      `Your Stellar wallet is on ${networkLabel}. Open Freighter/Varial → switch to Test Net, then try Continue again.`,
    )
  }

  try {
    // Varial signMessage only accepts `{ address }` — do not pass networkPassphrase.
    const { signedMessage } = await StellarWalletsKit.signMessage(message, {
      address: params.wallet,
    })
    if (!signedMessage) {
      throw new Error('Stellar wallet did not return a signature.')
    }
    return { signature: signedMessage, message }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Main Net|Test Net|network/i.test(msg)) {
      throw new Error(
        'Your Stellar wallet network does not match Test Net. In Freighter/Varial, switch to Test Net, then try again.',
      )
    }
    if (/signMessage|does not support/i.test(msg)) {
      throw new Error(
        'This Stellar wallet cannot sign login messages. Use Freighter/Varial or Albedo.',
      )
    }
    throw e
  }
}

async function ensureTestnetAccountExists(address: string): Promise<void> {
  const accountUrl = `${STELLAR_TESTNET_HORIZON_URL}/accounts/${encodeURIComponent(address)}`
  const existing = await fetch(accountUrl)
  if (existing.ok) return

  const funded = await fetch(
    `${STELLAR_TESTNET_FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`,
  )
  if (!funded.ok && funded.status !== 400) {
    throw new Error(
      'Could not fund your Stellar Testnet account with Friendbot. Open Freighter/Varial on Test Net and fund the account, then retry.',
    )
  }
}

/**
 * Add a classic trustline for FISTUSD on Stellar Testnet using the connected kit wallet.
 * Required before the issuer faucet can mint.
 */
export async function addFistUsdTrustlineViaKit(address: string): Promise<{ hash: string }> {
  const normalized = address.trim().toUpperCase()
  if (!normalized.startsWith('G') || normalized.length !== 56) {
    throw new Error('Connect a valid Stellar wallet first.')
  }

  const { StellarWalletsKit, Networks } = await initStellarWalletsKit()
  const { ok, networkLabel } = await isWalletOnStellarTestnet(StellarWalletsKit, Networks)
  if (!ok) {
    throw new Error(
      `Your Stellar wallet is on ${networkLabel}. Switch Freighter/Varial to Test Net, then retry.`,
    )
  }

  await ensureTestnetAccountExists(normalized)

  const { Asset, Horizon, Operation, TransactionBuilder } = await import('@stellar/stellar-sdk')
  const server = new Horizon.Server(STELLAR_TESTNET_HORIZON_URL)
  const account = await server.loadAccount(normalized)
  const asset = new Asset(STELLAR_TEST_ASSET_CODE, STELLAR_TEST_ASSET_ISSUER)

  const alreadyTrusted = account.balances.some(
    (b) =>
      'asset_code' in b &&
      b.asset_code === STELLAR_TEST_ASSET_CODE &&
      'asset_issuer' in b &&
      b.asset_issuer === STELLAR_TEST_ASSET_ISSUER,
  )
  if (alreadyTrusted) {
    return { hash: 'already-trusted' }
  }

  const fee = await server.fetchBaseFee()
  const tx = new TransactionBuilder(account, {
    fee: String(fee),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build()

  const { signedTxXdr } = await StellarWalletsKit.signTransaction(tx.toXDR(), {
    address: normalized,
    networkPassphrase: Networks.TESTNET,
  })
  if (!signedTxXdr) {
    throw new Error('Stellar wallet did not return a signed trustline transaction.')
  }

  const result = await server.submitTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET),
  )
  const hash = String((result as { hash?: string }).hash || '')
  if (!hash) {
    throw new Error('Trustline transaction submitted but no hash was returned.')
  }
  return { hash }
}
