import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We keep our existing manifest.json, don't auto-generate
      manifest: false,
      workbox: {
        // Web Push handlers live in public/push-sw.js and are pulled into the
        // generated service worker here (generateSW mode has no other hook).
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // These paths are handled server-side (Battlefield proxy, share OG
        // pages, API functions). Without a denylist the SW's navigation
        // fallback would serve the cached SPA shell to every returning visitor.
        navigateFallbackDenylist: [/^\/battlefield/, /^\/c\//, /^\/api\//],
        runtimeCaching: [
          {
            // Cache CoinGecko prices (main source of data)
            urlPattern: /^https:\/\/api\.coingecko\.com\/api\/v3\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'coingecko-prices',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Google Fonts (Inter) — keep the app looking right offline
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache images (coin logos)
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              // Only ever store a real success. Without this a single failed or
              // opaque response gets cached under CacheFirst and that coin's
              // logo stays broken for thirty days, with no network request left
              // to notice it: the cache answers first, every time.
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcss,
        autoprefixer,
      ],
    },
  },
  server: {
    port: 3000,
    // Dev has no Vercel functions, and the CoinGecko image CDN's CORS is too
    // flaky for direct canvas loads (some POPs omit ACAO entirely). Forwarding
    // /api to production means dev exercises the exact same code path.
    proxy: {
      '/api': { target: 'https://www.cryptodust.xyz', changeOrigin: true },
    },
  },
})
