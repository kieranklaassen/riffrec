import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // `riffrec` is linked from the repo root (`file:../..`), so its `dist/`
    // would otherwise import the root's copy of React and the app would run
    // two React instances. Force both to resolve from this app.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    strictPort: true,
    // The demo is reached through a Cloudflare quick tunnel; Vite blocks
    // unknown Host headers unless the hostname is allowed here.
    allowedHosts: ['.trycloudflare.com', 'localhost'],
  },
})
