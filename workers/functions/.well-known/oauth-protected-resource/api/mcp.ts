import { corsHeaders, generateClerkProtectedResourceMetadata } from '@clerk/mcp-tools/server'

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
	const resourceUrl = new URL('/api/mcp', request.url).toString()
	const metadata = generateClerkProtectedResourceMetadata({
		publishableKey: env.CLERK_PUBLISHABLE_KEY,
		resourceUrl
	})
	return new Response(JSON.stringify(metadata), {
		headers: { 'Content-Type': 'application/json', ...corsHeaders }
	})
}
