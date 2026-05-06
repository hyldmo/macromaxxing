// Self-heal when a stale client references a hashed asset that the current
// deploy no longer has. CF Pages returns 404 (via our catchall Function) or
// the browser hits a MIME mismatch — either way the main bundle never runs,
// so the in-app Update banner can't render. This listener runs first, catches
// the <script>/<link> load failure, nukes the SW + caches, and hard-reloads.
;(() => {
	var recovered = false
	function recover(detail) {
		if (recovered) return
		recovered = true
		try {
			console.warn('[app] stale-client recovery:', detail)
		} catch {
			// console may be unavailable; ignore
		}
		var root = document.getElementById('root') || document.body
		while (root.firstChild) root.removeChild(root.firstChild)
		var wrap = document.createElement('div')
		wrap.style.cssText =
			'font-family:system-ui;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center;color:#eae7e2;background:#1f1d1b'
		var inner = document.createElement('div')
		var title = document.createElement('div')
		title.style.cssText = 'font-size:1.25rem;margin-bottom:.5rem'
		title.textContent = 'Updating app…'
		var sub = document.createElement('div')
		sub.style.opacity = '.6'
		sub.textContent = 'Clearing cached version.'
		inner.appendChild(title)
		inner.appendChild(sub)
		wrap.appendChild(inner)
		root.appendChild(wrap)
		var done = () => {
			var sep = location.search ? '&' : '?'
			location.replace(`${location.pathname + location.search + sep}_v=${Date.now()}`)
		}
		var tasks = []
		if ('serviceWorker' in navigator) {
			tasks.push(
				navigator.serviceWorker
					.getRegistrations()
					.then(regs => Promise.all(regs.map(r => r.unregister())))
					.catch(() => {
						// best-effort cleanup; reload anyway
					})
			)
		}
		if ('caches' in window) {
			tasks.push(
				caches
					.keys()
					.then(names => Promise.all(names.map(n => caches.delete(n))))
					.catch(() => {
						// best-effort cleanup; reload anyway
					})
			)
		}
		Promise.all(tasks).then(done, done)
	}
	window.addEventListener(
		'error',
		e => {
			var t = e.target
			if (!t || t === window) return
			var src = t.src || t.href
			if (!src || src.indexOf('/assets/') === -1) return
			if (navigator.onLine === false) return
			if (location.search.indexOf('_v=') !== -1) return
			recover(`asset load failed: ${src}`)
		},
		true
	)
})()
