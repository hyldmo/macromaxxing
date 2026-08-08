// Keep viewport-fit=cover here in step with the meta tag in root.tsx — this overwrites it
// wholesale in standalone, and dropping the flag would zero out every safe-area inset.
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
	document
		.querySelector('meta[name="viewport"]')
		.setAttribute(
			'content',
			'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
		)
}
