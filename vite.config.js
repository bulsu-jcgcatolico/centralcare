import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Caches the app shell (HTML/JS/CSS) so the site itself still loads
      // with no internet connection. Firestore's own offline persistence
      // (configured in src/firebase/config.js) is what keeps your actual
      // data available and queues writes — this plugin is purely about the
      // app being reachable at all when offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        name: 'CentralCare Health System',
        short_name: 'CentralCare',
        description: 'Health management system for Malolos City — CHO, RHU, and Barangay Health Station coordination.',
        theme_color: '#1a56db',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
