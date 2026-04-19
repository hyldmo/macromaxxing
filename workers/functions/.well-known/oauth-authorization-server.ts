import { corsHeaders, fetchClerkAuthorizationServerMetadata } from '@clerk/mcp-tools/server'

export const onRequest: PagesFunction<Env> = async ({ env }) => {
	const metadata = await fetchClerkAuthorizationServerMetadata({
		publishableKey: env.CLERK_PUBLISHABLE_KEY
	})
	return new Response(JSON.stringify(metadata), {
		headers: { 'Content-Type': 'application/json', ...corsHeaders }
	})
}
