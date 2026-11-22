/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the app be served from a sub path, e.g. GitHub Pages (/sokskart/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  // vector tile test fixtures
  assetsInclude: ['**/*.pbf'],
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Søkskart – søk etter savnet person',
        short_name: 'Søkskart',
        description: 'Støtteverktøy for planlegging av søk etter savnet person på land',
        lang: 'nb',
        theme_color: '#c8102e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Map tiles: cache first so pre-downloaded areas work offline.
            urlPattern: ({ url }) =>
              url.hostname === 'cache.kartverket.no' || url.hostname === 'tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'kartfliser',
              expiration: { maxEntries: 30000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
