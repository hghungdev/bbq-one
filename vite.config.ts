import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import manifest from './public/manifest.json'

export default defineConfig({
  plugins: [vue(), crx({ manifest })],
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
