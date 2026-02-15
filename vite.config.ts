import path from 'node:path'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		outDir: 'workers/dist',
		sourcemap: true
	},
	server: {
		port: 1337,
		proxy: {
			'/api': process.env.API_URL ?? 'http://localhost:8788'
		}
	},
	plugins: [
		react(),
		tailwind(),
		VitePWA({
			registerType: 'prompt',
			manifest: {
				name: 'Macromaxxing',
				short_name: 'Macromaxxing',
				description: 'Recipe nutrition tracker for meal preppers',
				theme_color: '#1f1d1b',
				background_color: '#1f1d1b',
				display: 'standalone',
				icons: [
					{ src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: '/apple-touch-icon-180x180.png', sizes: '180x180', type: 'image/png' },
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
				navigateFallback: '/index.html',
				navigateFallbackDenylist: [/^\/api\//]
			}
		})
	],
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './src')
		}
	}
})
