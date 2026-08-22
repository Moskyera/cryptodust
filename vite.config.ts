import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Serves /api/token-addresses locally.
 *
 * Every other /api route is proxied to production below, which works because
 * those functions are already deployed there. A function that only exists in
 * the working tree is not, so without this it would 404 in dev and the flow
 * rings would silently be missing from the ecosystem tabs on the very machine
 * they are being built on.
 *
 * configureServer runs in dev only. The production build never sees this.
 */
function devTokenAddresses() {
  return {
    name: 'dev-token-addresses',
    configureServer(server: any) {
      server.middlewares.use('/api/token-addresses', async (req: any, res: any) => {
        // Hand-parsed rather than via URL/URLSearchParams: this file is compiled
        // under tsconfig.node.json, which carries no DOM lib and the project has
        // no @types/node, so both of those are types here and not values. Using
        // them compiles in the editor and then fails `tsc -b`, which is the
        // first half of the build script, so the deploy dies before Vite runs.
        const qs = (req.url || '').split('?')[1] || ''
        const query: Record<string, string> = {}
        for (const part of qs.split('&')) {
          if (!part) continue
          const eq = part.indexOf('=')
          const k = eq < 0 ? part : part.slice(0, eq)
          const v = eq < 0 ? '' : part.slice(eq + 1)
          query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '))
        }
        let handler: any
        try {
          handler = (await server.ssrLoadModule('/api/token-addresses.ts')).default
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(error) }))
          return
        }
        try {
        await handler(
          { method: req.method, query },
          {
            status(code: number) { res.statusCode = code; return this },
            setHeader(k: string, v: string) { res.setHeader(k, v); return this },
            send(body: string) { res.end(body) },
            json(body: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            },
          }
        )
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(error) }))
        }
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devTokenAddresses(),
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
