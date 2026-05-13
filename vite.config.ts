import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import manifest from './public/manifest.json'

const extensionVersion = (manifest as { version: string }).version

export default defineConfig({
  plugins: [vue(), crx({ manifest })],
  define: {
    // Đồng bộ với public/manifest.json — dùng khi không có chrome.runtime (preview / test).
    'import.meta.env.VITE_EXTENSION_VERSION': JSON.stringify(extensionVersion),
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        offscreen: fileURLToPath(new URL('./offscreen.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
