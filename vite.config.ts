import path from 'node:path'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
	server: {
		port: 1337,
		proxy: {
			'/api': 'https://macromaxxing.pages.dev'
		}
	},
	plugins: [react(), tailwind()],
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './src')
		}
	}
})
