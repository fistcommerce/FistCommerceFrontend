import { STELLAR_TESTNET_CHAIN_ID } from '@/stellar/chain'
import {
  STELLAR_TEST_ASSET_CODE,
  STELLAR_TEST_ASSET_ISSUER,
  STELLAR_TESTNET_FRIENDBOT_URL,
  STELLAR_TESTNET_HORIZON_URL,
} from '@/stellar/testAsset'

type KitNs = typeof import('@creit.tech/stellar-wallets-kit')

/** Initialize kit modules (Testnet) and return the kit namespace. */
export async function initAndGetKit(): Promise<KitNs> {
  return initStellarWalletsKit()
}

async function initStellarWalletsKit(): Promise<KitNs> {
  if (typeof window === 'undefined') {
    throw new Error('Stellar Wallets Kit is only available in the browser.')
  }

  const mod = await import('@creit.tech/stellar-wallets-kit')
  const { AlbedoModule } = await import('@creit.tech/stellar-wallets-kit/modules/albedo')
  const { VarialModule } = await import('@creit.tech/stellar-wallets-kit/modules/varial')

  const { StellarWalletsKit, Networks } = mod

  // Always re-init: Vite HMR can remount kit package state and leave activeModules empty,
  // which sticks the auth modal on "Loading wallets...".
  // Only wallets that support signMessage (needed for Stellar login):
  // Varial/Freighter + Albedo.
  // Omitted: Lobstr/xBull (Vite CJS interop), Rabet (no signMessage).
  StellarWalletsKit.init({
    network: Networks.TESTNET,
    modules: [new VarialModule(), new AlbedoModule()],
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false,
    },
  })
  StellarWalletsKit.setNetwork(Networks.TESTNET)
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
  const { address } = await StellarWalletsKit.authModal()
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
