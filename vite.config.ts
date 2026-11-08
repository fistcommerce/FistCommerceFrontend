import fs from 'fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

/** Read the API origin from env files. A shell override of VITE_API_BASE_URL must not replace this. */
function apiOriginFromEnvFiles(): string | null {
  const files = ['.env', '.env.local', '.env.development', '.env.development.local']
  let value = ''
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    const match = fs.readFileSync(file, 'utf8').match(/^VITE_API_BASE_URL=(.*)$/m)
    if (!match) continue
    value = match[1].trim().replace(/^['"]|['"]$/g, '')
  }
  if (!/^https?:\/\//.test(value)) return null
  return new URL(value).origin
}

function previewApiProxy(): Record<string, ProxyOptions> {
  if (process.env.PUBLIC_PREVIEW !== '1') return {}
  const target = apiOriginFromEnvFiles()
  if (!target) return {}
  return {
    '/api': {
      target,
      changeOrigin: true,
      secure: true,
    },
  }
}

/** Prefer real ESM builds — several @walletconnect packages only set `main` to CJS. */
function walletConnectEsmAlias(pkg: string, esmFile = 'dist/esm/index.js') {
  return {
    find: new RegExp(`^${pkg.replace('/', '\\/')}$`),
    replacement: path.resolve(__dirname, `node_modules/${pkg}/${esmFile}`),
  }
}

const stellarKitEntries = [
  '@creit.tech/stellar-wallets-kit',
  '@creit.tech/stellar-wallets-kit/modules/albedo',
  '@creit.tech/stellar-wallets-kit/modules/varial',
  '@creit.tech/stellar-wallets-kit/modules/wallet-connect',
  '@creit.tech/stellar-wallets-kit/modules/utils',
  '@creit.tech/stellar-wallets-kit/sdk',
] as const

// https://vitejs.dev/config/
export default defineConfig(() => {
  const publicPreview = process.env.PUBLIC_PREVIEW === '1'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: publicPreview ? true : undefined,
      allowedHosts: publicPreview
        ? ['.ngrok-free.app', '.ngrok.io', '.ngrok.app', '.ngrok-free.dev', '.trycloudflare.com']
        : undefined,
      proxy: {
        ...previewApiProxy(),
        // Same-origin proxy so browser debug logs reach the local ingest server (avoids CORS).
        '/ingest/fb9c849e-37ad-4a71-b70c-257ccd07e08d': {
          target: 'http://127.0.0.1:7881',
          changeOrigin: true,
        },
      },
    },
    /**
     * Prebundle the kit + WalletConnect graph so CJS deps (events, dayjs, @walletconnect/*)
     * get proper ESM interop. Keep Preact deduped so auth-modal signals stay single-instance
     * (previously we excluded the kit, which broke WC named imports in Vite).
     */
    optimizeDeps: {
      include: [
        'react-is',
        'recharts',
        'buffer',
        'events',
        'dayjs',
        'preact',
        '@preact/signals',
        '@stellar/stellar-sdk',
        ...stellarKitEntries,
      ],
    },
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, './src') },
        { find: 'buffer', replacement: path.resolve(__dirname, './node_modules/buffer/') },
        // CJS `events` has no named ESM export; WC/AppKit import { EventEmitter } from 'events'.
        {
          find: /^events$/,
          replacement: path.resolve(__dirname, './src/shims/events.ts'),
        },
        // dayjs `main` is a UMD min bundle without ESM default export.
        {
          find: /^dayjs$/,
          replacement: path.resolve(__dirname, 'node_modules/dayjs/esm/index.js'),
        },
        // WalletConnect utils packages ship ESM but advertise CJS-only `main`.
        walletConnectEsmAlias('@walletconnect/time'),
        walletConnectEsmAlias('@walletconnect/events'),
        walletConnectEsmAlias('@walletconnect/window-getters'),
        walletConnectEsmAlias('@walletconnect/window-metadata'),
        walletConnectEsmAlias('@walletconnect/safe-json'),
        walletConnectEsmAlias('@walletconnect/jsonrpc-utils'),
        walletConnectEsmAlias('@walletconnect/environment'),
        walletConnectEsmAlias('@walletconnect/jsonrpc-types', 'dist/index.es.js'),
        // Exact match only — Freighter's UMD bundle breaks Vite named ESM imports (`getAddress`).
        {
          find: /^@stellar\/freighter-api$/,
          replacement: path.resolve(__dirname, './src/shims/freighter-api.ts'),
        },
      ],
      dedupe: ['preact', '@preact/signals', '@preact/signals-core', '@creit.tech/stellar-wallets-kit'],
    },
  }
})
