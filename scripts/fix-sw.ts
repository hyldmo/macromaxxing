// Postbuild patches for the Workbox-generated SW.
// See https://github.com/vite-pwa/vite-plugin-pwa/issues/809.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const SW_PATH = 'workers/dist/client/sw.js'
const INDEX_HTML_PATH = 'workers/dist/client/index.html'
const ASSETS_DIR = 'workers/dist/client/assets'
const PRECACHE_MARKER = 's.precacheAndRoute(['
const REVISION_PLACEHOLDER = '__INDEX_HTML_REVISION__'

let sw = readFileSync(SW_PATH, 'utf8')

// Pin index.html's precache revision to a content hash. vite.config.ts emits a
// placeholder because index.html doesn't exist at config-eval time; resolving it
// to the actual content here keeps the SW byte-identical across no-op builds so
// only genuine client changes surface the "new version available" prompt.
if (!sw.includes(REVISION_PLACEHOLDER)) {
	console.error(`[fix-sw] revision placeholder ${REVISION_PLACEHOLDER} not found in ${SW_PATH}`)
	process.exit(1)
}
const indexRevision = createHash('md5').update(readFileSync(INDEX_HTML_PATH)).digest('hex')
sw = sw.replaceAll(REVISION_PLACEHOLDER, indexRevision)
console.info(`[fix-sw] pinned index.html revision to ${indexRevision}`)

// Add hashed manifest-*.js chunks that vite-plugin-pwa misses when running
// alongside @react-router/dev (RR emits assets after vite-pwa's transformIndexHtml hook).
const manifestChunks = readdirSync(ASSETS_DIR).filter(f => f.startsWith('manifest-') && f.endsWith('.js'))
const missing = manifestChunks.filter(name => !sw.includes(`"assets/${name}"`))
if (missing.length === 0) {
	console.info(
		manifestChunks.length === 0
			? '[fix-sw] no manifest-*.js chunks found; nothing to patch'
			: '[fix-sw] sw.js already references all manifest chunks'
	)
} else {
	const inserts = missing.map(name => `{url:"assets/${name}",revision:null}`).join(',')
	const patched = sw.replace(PRECACHE_MARKER, `${PRECACHE_MARKER}${inserts},`)
	if (patched === sw) {
		console.error(`[fix-sw] failed to find precacheAndRoute insertion point in ${SW_PATH}`)
		process.exit(1)
	}
	sw = patched
	console.info(`[fix-sw] added ${missing.map(n => `assets/${n}`).join(', ')}`)
}

writeFileSync(SW_PATH, sw)
