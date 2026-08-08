// Standalone deliberately does NOT get viewport-fit=cover, unlike the meta in root.tsx.
// The two surfaces have different bugs: in-browser, Safari renders page content full-bleed to
// the screen edge while clamping a `bottom: 0` fixed bar above it, so the tab bar needs cover
// (plus the env() insets it unlocks) to reach the bottom. Installed, iOS already insets the
// viewport and the OS paints the strip below the bar — it is correct as-is, and turning cover
// on there only makes the bar a home-indicator taller for nothing.
//
// Leaving cover off here also zeroes every env(safe-area-inset-*), so the safe-area padding on
// the nav, overlays and content reserve collapses to 0 in standalone automatically. Don't add
// cover here without re-checking those.
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
	document
		.querySelector('meta[name="viewport"]')
		.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
}
