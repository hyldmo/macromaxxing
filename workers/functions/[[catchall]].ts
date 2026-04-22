// CF Pages SPA-falls-back every missed path to index.html with 200. Stale clients
// (old SW/browser cache referencing removed hashed assets) then see HTML where
// they expect a JS/CSS module → "MIME type text/html" load errors. Convert that
// into a proper 404 for anything that looks like a static asset so the browser
// fails cleanly and the SW update cycle can recover.
export const onRequest: PagesFunction<Env> = async ctx => {
	const res = await ctx.next()
	const path = new URL(ctx.request.url).pathname
	const ct = res.headers.get('content-type') ?? ''

	const hasExt = /\.[a-z0-9]+$/i.test(path)
	const isHtmlDoc = path.endsWith('.html') || path === '/' || !hasExt
	const looksLikeAsset = hasExt && !isHtmlDoc

	if (looksLikeAsset && res.status === 200 && ct.includes('text/html')) {
		return new Response('Not Found', {
			status: 404,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		})
	}

	return res
}
