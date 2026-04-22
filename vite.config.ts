import { execFileSync } from 'node:child_process'
import path from 'node:path'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

function resolveAppVersion(): string {
	try {
		return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
			stdio: ['ignore', 'pipe', 'ignore']
		})
			.toString()
			.trim()
	} catch {
		return 'dev'
	}
}

// https://vitejs.dev/config/
export default defineConfig({
	define: {
		'import.meta.env.VITE_REPO_URL': JSON.stringify(pkg.repository.url.replace(/\.git$/, '')),
		'import.meta.env.VITE_APP_VERSION': JSON.stringify(resolveAppVersion())
	},
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
			registerType: 'autoUpdate',
			manifest: {
				name: 'Macromaxxing',
				short_name: 'Macromaxxing',
				description: 'Recipe nutrition tracker for meal preppers',
				theme_color: '#1f1d1b',
				background_color: '#1f1d1b',
				display: 'standalone',
				start_url: '/',
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
				navigateFallbackDenylist: [/^\/api\//],
				importScripts: ['/sw-custom.js'],
				cleanupOutdatedCaches: true,
				skipWaiting: true,
				clientsClaim: true
			}
		})
	],
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './src')
		}
	}
})
