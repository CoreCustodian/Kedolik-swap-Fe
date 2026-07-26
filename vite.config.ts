import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_AGGREGATOR_VOLUME_API || 'https://kedolik-swap-fe-secret.vercel.app',
        changeOrigin: true,
      },
      '/okx-api': {
        target: 'https://web3.okx.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/okx-api/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})

