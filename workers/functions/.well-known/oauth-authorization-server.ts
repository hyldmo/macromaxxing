import { corsHeaders, fetchClerkAuthorizationServerMetadata } from '@clerk/mcp-tools/server'
import { MCP_OAUTH_SCOPES } from '../lib/mcp-oauth'

export const onRequest: PagesFunction<Env> = async ({ env }) => {
	const metadata = await fetchClerkAuthorizationServerMetadata({
		publishableKey: env.CLERK_PUBLISHABLE_KEY
	})
	// Clients that skip protected resource metadata pick their scopes from this list.
	return new Response(JSON.stringify({ ...metadata, scopes_supported: MCP_OAUTH_SCOPES }), {
		headers: { 'Content-Type': 'application/json', ...corsHeaders }
	})
}
