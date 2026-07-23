import path from 'node:path'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Builds the MCP Apps widget — a small React app that mounts the SAME MuscleLoadPanel/BodyMap the
 * app renders (via the `~` alias into src/) plus the app's Tailwind build + design tokens, so the
 * in-Claude widget is identical to its in-app twin. Separate from vite.config.ts (no react-router /
 * PWA plugins — this emits a standalone browser bundle, not the app). scripts/build-widgets.ts
 * inlines the emitted w.js/w.css into workers/functions/widgets/widgets.generated.ts, which the
 * Pages Function imports as a plain string (MCP Apps' default CSP blocks external <script>/<link>,
 * so everything is inlined).
 */
export default defineConfig({
	root: path.resolve(__dirname, 'src/mcp-widgets'),
	plugins: [react(), tailwind()],
	resolve: {
		alias: {
			'~': path.resolve(__dirname, 'src')
		}
	},
	build: {
		outDir: path.resolve(__dirname, '.widget-dist'),
		emptyOutDir: true,
		// Inline every asset and keep it to one JS + one CSS file for scripts/build-widgets.ts to embed.
		assetsInlineLimit: 0,
		cssCodeSplit: false,
		modulePreload: false,
		rollupOptions: {
			output: { inlineDynamicImports: true, entryFileNames: 'w.js', assetFileNames: 'w.[ext]' }
		}
	}
})
