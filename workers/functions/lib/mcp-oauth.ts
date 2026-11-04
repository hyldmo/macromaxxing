import { corsHeaders, generateClerkProtectedResourceMetadata } from '@clerk/mcp-tools/server'

/**
 * The scopes MCP clients should request from Clerk: the set Clerk grants a dynamically registered
 * client that sends no `scope` (Dashboard: OAuth applications > Settings > Default scopes for
 * dynamic clients). Clerk's own metadata advertises more, including `openid`, and a client that
 * requests a scope outside its registration fails with `invalid_scope`.
 *
 * The MCP spec (2026-07-28) says servers SHOULD NOT list `offline_access`, since clients can add it
 * from the authorization server's metadata. The official TypeScript SDK (1.32) sends this list as is
 * and adds nothing, and Clerk documents `offline_access` as the refresh token scope on top of
 * one-day access tokens, so it stays listed.
 */
export const MCP_OAUTH_SCOPES = ['profile', 'email', 'offline_access']

export const protectedResourceMetadata: PagesFunction<Env> = ({ request, env }) => {
	const metadata = generateClerkProtectedResourceMetadata({
		publishableKey: env.CLERK_PUBLISHABLE_KEY,
		resourceUrl: new URL('/api/mcp', request.url).toString(),
		properties: { scopes_supported: MCP_OAUTH_SCOPES }
	})
	return new Response(JSON.stringify(metadata), {
		headers: { 'Content-Type': 'application/json', ...corsHeaders }
	})
}
