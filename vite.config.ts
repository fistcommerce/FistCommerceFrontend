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
  /** Recharts imports `react-is`; ensure it’s pre-bundled so dev server resolves it. */
  optimizeDeps: {
    include: ['react-is', 'recharts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  }
})
