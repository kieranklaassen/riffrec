import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    // In dev, import riffrec straight from the repo's `src/` so edits to the
    // live overlay hot-reload here with no `npm run build`. `vite build` keeps
    // the linked package (`file:../..`), so the demo still ships against the
    // built `dist/` that npm consumers get.
    alias:
      command === 'serve'
        ? { riffrec: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) }
        : {},
    // `riffrec` is linked from the repo root, so its code would otherwise
    // import the root's copy of React and the app would run two React
    // instances. Force both to resolve from this app.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    strictPort: true,
    // The demo is reached through a Cloudflare quick tunnel; Vite blocks
    // unknown Host headers unless the hostname is allowed here.
    allowedHosts: ['.trycloudflare.com', 'localhost'],
    // Serving `../../src` needs the repo root on the allow-list.
    fs: { allow: ['../..'] },
  },
}))
