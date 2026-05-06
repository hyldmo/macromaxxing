// Patches the Workbox-generated SW to include hashed `manifest-*.js` chunks
// that vite-plugin-pwa misses when running alongside @react-router/dev (the
// RR plugin emits assets after vite-pwa's transformIndexHtml hook fires).
// See https://github.com/vite-pwa/vite-plugin-pwa/issues/809.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const SW_PATH = 'workers/dist/client/sw.js'
const ASSETS_DIR = 'workers/dist/client/assets'
const PRECACHE_MARKER = 's.precacheAndRoute(['

const sw = readFileSync(SW_PATH, 'utf8')

const manifestChunks = readdirSync(ASSETS_DIR).filter(f => f.startsWith('manifest-') && f.endsWith('.js'))
if (manifestChunks.length === 0) {
	console.info('[fix-sw] no manifest-*.js chunks found; nothing to patch')
	process.exit(0)
}

const missing = manifestChunks.filter(name => !sw.includes(`"assets/${name}"`))
if (missing.length === 0) {
	console.info('[fix-sw] sw.js already references all manifest chunks')
	process.exit(0)
}

const inserts = missing.map(name => `{url:"assets/${name}",revision:null}`).join(',')
const patched = sw.replace(PRECACHE_MARKER, `${PRECACHE_MARKER}${inserts},`)

if (patched === sw) {
	console.error(`[fix-sw] failed to find precacheAndRoute insertion point in ${SW_PATH}`)
	process.exit(1)
}

writeFileSync(SW_PATH, patched)
console.info(`[fix-sw] patched ${SW_PATH}: added ${missing.map(n => `assets/${n}`).join(', ')}`)
