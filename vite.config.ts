import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Same-origin proxy so browser debug logs reach the local ingest server (avoids CORS).
      '/ingest/fb9c849e-37ad-4a71-b70c-257ccd07e08d': {
        target: 'http://127.0.0.1:7881',
        changeOrigin: true,
      },
    },
  },
  /**
   * Circle W3S SDK pulls Node-oriented deps. Vite does not provide `process`/`Buffer`,
   * and `jsonwebtoken` breaks under Rolldown CJS interop (`Object.create(undefined)`).
   */
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  optimizeDeps: {
    include: ['react-is', 'recharts', 'process', 'buffer', '@circle-fin/w3s-pw-web-sdk'],
    exclude: ['jsonwebtoken'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      process: 'process/browser',
      buffer: 'buffer/',
      jsonwebtoken: path.resolve(__dirname, './src/shims/jsonwebtoken.ts'),
    },
  },
})
