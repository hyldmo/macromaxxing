import path from 'node:path'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
	plugins: [react(), tailwind()],
	resolve: {
		alias: {
			'~': path.resolve(__dirname, './src')
		}
	}
})
