import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths so the built site works from any IPFS path or gateway.
  base: './',
  plugins: [react(), tailwindcss()],
})
