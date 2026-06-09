import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': {
        target: process.env['API_URL'] ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
