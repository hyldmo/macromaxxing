import { AI_PROVIDER_OPTIONS, type AiProvider } from '@macromaxxing/db'
import { type FC, useEffect, useState } from 'react'
import {
	Button,
	ButtonGroup,
	Card,
	CardContent,
	CardHeader,
	Input,
	SaveButton,
	Switch,
	TRPCError
} from '~/components/ui'
import { ProfileForm } from '~/features/workouts/components/ProfileForm'
import { useDocumentTitle, useUnsavedChanges } from '~/lib'
import { trpc } from '~/lib/trpc'

export function SettingsPage() {
	useDocumentTitle('Settings')
	const settingsQuery = trpc.settings.get.useQuery()
	const utils = trpc.useUtils()
	const saveMutation = trpc.settings.save.useMutation({
		onSuccess: () => {
			utils.settings.get.invalidate()
			setApiKey('')
			setEditingKey(false)
			setSynced(false)
		}
	})

	const [provider, setProvider] = useState<AiProvider>('gemini')
	const [apiKey, setApiKey] = useState('')
	const [editingKey, setEditingKey] = useState(false)
	const [batchLookups, setBatchLookups] = useState(false)
	const [modelFallback, setModelFallback] = useState(false)
	const [synced, setSynced] = useState(false)

	const savedProvider = settingsQuery.data?.provider
	const providerChanged = savedProvider && provider !== savedProvider
	const batchChanged =
		settingsQuery.data?.batchLookups !== undefined && batchLookups !== settingsQuery.data.batchLookups
	const fallbackChanged =
		settingsQuery.data?.modelFallback !== undefined && modelFallback !== settingsQuery.data.modelFallback

	useEffect(() => {
		if (savedProvider) setProvider(savedProvider)
	}, [savedProvider])
	useEffect(() => {
		if (settingsQuery.data) {
			setBatchLookups(settingsQuery.data.batchLookups)
			setModelFallback(settingsQuery.data.modelFallback)
			setSynced(true)
		}
	}, [settingsQuery.data])

	function handleSave(e: React.FormEvent) {
		e.preventDefault()
		saveMutation.mutate({
			provider,
			apiKey: apiKey || undefined,
			batchLookups,
			modelFallback
		})
	}

	const canSave = apiKey || providerChanged || batchChanged || fallbackChanged

	useUnsavedChanges(synced && !!canSave)

	return (
		<div className="space-y-3">
			<h1 className="font-semibold text-ink">Settings</h1>

			{settingsQuery.error && <TRPCError error={settingsQuery.error} />}

			<Card>
				<CardHeader>
					<h2 className="font-medium text-ink text-sm">Body Profile</h2>
					<p className="text-ink-muted text-xs">
						Your body measurements for workout validation and nutrition targets.
					</p>
				</CardHeader>
				<CardContent>
					<ProfileForm />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<h2 className="font-medium text-ink text-sm">AI Provider</h2>
					<p className="text-ink-muted text-xs">
						Configure your AI provider for ingredient lookup. Your API key is encrypted at rest.
					</p>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSave} className="space-y-3">
						<fieldset>
							<legend className="mb-1.5 text-ink-muted text-sm">Provider</legend>
							<div className="flex gap-1.5">
								{AI_PROVIDER_OPTIONS.map(p => (
									<button
										key={p.value}
										type="button"
										onClick={() => setProvider(p.value)}
										className={`rounded-sm border px-3 py-1 text-sm transition-colors ${
											provider === p.value
												? 'border-accent bg-accent text-surface-0'
												: 'border-edge text-ink-muted hover:bg-surface-2 hover:text-ink'
										}`}
									>
										{p.label}
									</button>
								))}
							</div>
						</fieldset>

						<div className="space-y-1">
							<span className="text-ink-muted text-sm">API Key</span>
							{settingsQuery.data?.hasKey ? (
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										className="shrink-0"
										onClick={() => {
											setEditingKey(!editingKey)
											setApiKey('')
										}}
									>
										{editingKey ? 'Cancel' : 'Change'}
									</Button>
									{editingKey ? (
										<Input
											type="password"
											name="apiKey"
											placeholder="Enter new API key"
											autoComplete="off"
											value={apiKey}
											onChange={e => setApiKey(e.target.value)}
											className="min-w-0"
										/>
									) : (
										<span className="text-ink-muted text-sm tracking-widest">••••••••••••••••</span>
									)}
								</div>
							) : (
								<Input
									type="password"
									name="apiKey"
									placeholder="Enter API key"
									readOnly={settingsQuery.isLoading}
									autoComplete="off"
									value={apiKey}
									onChange={e => setApiKey(e.target.value)}
								/>
							)}
						</div>

						<fieldset className="space-y-2">
							<legend className="mb-1.5 text-ink-muted text-sm">API Usage</legend>

							<label className="flex items-start gap-3" htmlFor="batch-lookups">
								<Switch
									id="batch-lookups"
									checked={batchLookups}
									onChange={setBatchLookups}
									className="mt-0.5"
								/>
								<div>
									<div className="text-ink text-sm">Batch ingredient lookups</div>
									<div className="text-ink-faint text-xs">
										Look up multiple ingredients in a single AI request. Uses fewer requests but may
										reduce accuracy.
									</div>
								</div>
							</label>

							<label className="flex items-start gap-3" htmlFor="model-fallback">
								<Switch
									id="model-fallback"
									checked={modelFallback}
									onChange={setModelFallback}
									className="mt-0.5"
								/>
								<div>
									<div className="text-ink text-sm">Model fallback</div>
									<div className="text-ink-faint text-xs">
										Automatically try cheaper models when rate-limited. Lower quality but won't fail
										on quota limits.
									</div>
								</div>
							</label>
						</fieldset>

						<SaveButton
							mutation={saveMutation}
							disabled={!canSave}
							pendingText={apiKey ? 'Verifying...' : 'Saving...'}
							rawError
						/>
					</form>
				</CardContent>
			</Card>

			<ApiTokensSection />
		</div>
	)
}

type McpClient = 'claude-desktop' | 'claude-code' | 'cursor'

const MCP_CLIENT_OPTIONS: { value: McpClient; label: string }[] = [
	{ value: 'claude-desktop', label: 'Claude Desktop' },
	{ value: 'claude-code', label: 'Claude Code' },
	{ value: 'cursor', label: 'Cursor' }
]

function getMcpConfig(client: McpClient, endpoint: string, token?: string): string {
	const bearer = token ?? '<YOUR_TOKEN>'
	switch (client) {
		case 'claude-desktop':
			return JSON.stringify(
				{ mcpServers: { macromaxxing: { url: endpoint, headers: { Authorization: `Bearer ${bearer}` } } } },
				null,
				2
			)
		case 'claude-code':
			return `claude mcp add macromaxxing --transport http "${endpoint}" --header "Authorization: Bearer ${bearer}"`
		case 'cursor':
			return JSON.stringify(
				{ mcpServers: { macromaxxing: { url: endpoint, headers: { Authorization: `Bearer ${bearer}` } } } },
				null,
				2
			)
	}
}

function getMcpConfigPath(client: McpClient): string {
	switch (client) {
		case 'claude-desktop':
			return '~/Library/Application Support/Claude/claude_desktop_config.json'
		case 'claude-code':
			return 'Run in terminal'
		case 'cursor':
			return '.cursor/mcp.json'
	}
}

const ApiTokensSection: FC = () => {
	const utils = trpc.useUtils()
	const tokensQuery = trpc.settings.listTokens.useQuery()
	const createMutation = trpc.settings.createToken.useMutation({
		onSuccess: () => utils.settings.listTokens.invalidate()
	})
	const deleteMutation = trpc.settings.deleteToken.useMutation({
		onSuccess: () => utils.settings.listTokens.invalidate()
	})

	const [name, setName] = useState('')
	const [createdToken, setCreatedToken] = useState<string | null>(null)
	const [copied, setCopied] = useState<'endpoint' | 'token' | 'config' | null>(null)
	const [mcpClient, setMcpClient] = useState<McpClient>('claude-desktop')

	const mcpEndpoint = `${window.location.origin}/api/mcp`

	function handleCopy(text: string, label: 'endpoint' | 'token' | 'config') {
		navigator.clipboard.writeText(text)
		setCopied(label)
		setTimeout(() => setCopied(prev => (prev === label ? null : prev)), 2000)
	}

	function handleCreate(e: React.FormEvent) {
		e.preventDefault()
		if (!name.trim()) return
		createMutation.mutate(
			{ name: name.trim() },
			{
				onSuccess: data => {
					setCreatedToken(data.token)
					setName('')
				}
			}
		)
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="font-medium text-ink text-sm">API Tokens</h2>
				<p className="text-ink-muted text-xs">Personal access tokens for the MCP server and API access.</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<form onSubmit={handleCreate} className="flex items-end gap-2">
					<div className="min-w-0 flex-1 space-y-1">
						<span className="text-ink-muted text-sm">New Token</span>
						<Input
							placeholder="Token name (e.g. Claude Desktop)"
							value={name}
							onChange={e => setName(e.target.value)}
						/>
					</div>
					<Button type="submit" disabled={!name.trim() || createMutation.isPending}>
						{createMutation.isPending ? 'Creating...' : 'Create'}
					</Button>
				</form>
				{createMutation.error && <TRPCError error={createMutation.error} />}

				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<span className="text-ink-muted text-sm">Setup</span>
						<ButtonGroup options={MCP_CLIENT_OPTIONS} value={mcpClient} onChange={setMcpClient} size="sm" />
					</div>
					<p className="text-ink-faint text-xs">{getMcpConfigPath(mcpClient)}</p>
					<pre className="overflow-x-auto rounded-md border border-edge bg-surface-0 p-2 font-mono text-ink text-xs">
						{getMcpConfig(mcpClient, mcpEndpoint, createdToken ?? undefined)}
					</pre>
					<Button
						variant="outline"
						onClick={() =>
							handleCopy(getMcpConfig(mcpClient, mcpEndpoint, createdToken ?? undefined), 'config')
						}
					>
						{copied === 'config' ? 'Copied!' : 'Copy'}
					</Button>
					{createdToken && (
						<p className="text-accent text-xs">
							Token embedded above. Copy the config now — the token won't be shown again.
						</p>
					)}
				</div>

				{tokensQuery.data && tokensQuery.data.length > 0 && (
					<div className="space-y-1">
						<span className="text-ink-muted text-sm">Active Tokens</span>
						<div className="divide-y divide-edge rounded-md border border-edge">
							{tokensQuery.data.map(token => (
								<div key={token.id} className="flex items-center justify-between px-3 py-2">
									<div className="min-w-0 flex-1">
										<div className="text-ink text-sm">{token.name}</div>
										<div className="text-ink-faint text-xs">
											Created{' '}
											<span className="font-mono tabular-nums">
												{new Date(token.createdAt).toLocaleDateString()}
											</span>
											{token.lastUsedAt && (
												<>
													{' '}
													· Last used{' '}
													<span className="font-mono tabular-nums">
														{new Date(token.lastUsedAt).toLocaleDateString()}
													</span>
												</>
											)}
										</div>
									</div>
									<Button
										variant="destructive"
										onClick={() => deleteMutation.mutate({ id: token.id })}
										disabled={deleteMutation.isPending}
									>
										Delete
									</Button>
								</div>
							))}
						</div>
					</div>
				)}
				{tokensQuery.error && <TRPCError error={tokensQuery.error} />}
			</CardContent>
		</Card>
	)
}
