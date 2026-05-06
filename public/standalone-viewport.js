if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
	document
		.querySelector('meta[name="viewport"]')
		.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
}
