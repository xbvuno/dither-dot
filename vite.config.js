import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import workboxBuild from 'workbox-build'
import wasm from 'vite-plugin-wasm'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

function generateServiceWorker() {
  return {
    name: 'generate-sw',
    closeBundle: async () => {
      await workboxBuild.generateSW({
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html,png,svg,jpg,jpeg,gif,ico,json,wasm}'
        ],
        swDest: 'dist/sw.js',
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources',
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 2592000 }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }
            }
          }
        ]
      })
    }
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    wasm(),
    generateServiceWorker()
  ],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 600,
    assetsInlineLimit: 100000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react'
          if (id.includes('node_modules/zustand/')) return 'vendor-zustand'
          if (id.includes('node_modules/lucide-react/')) return 'vendor-icons'
          if (id.includes('node_modules/gifuct-js/') || id.includes('node_modules/modern-gif/')) return 'vendor-gif'
        }
      }
    }
  },
  server: {
    port: 5173
  },
  preview: {
    port: 4173
  }
})
