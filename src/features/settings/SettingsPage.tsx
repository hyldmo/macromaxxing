import { AI_PROVIDER_OPTIONS, type AiProvider } from '@macromaxxing/db'
import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Card, CardContent, CardHeader } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { SaveButton } from '~/components/ui/SaveButton'
import { Switch } from '~/components/ui/Switch'
import { TRPCError } from '~/components/ui/TRPCError'
import { ProfileForm } from '~/features/workouts/components/ProfileForm'
import { trpc } from '~/lib/trpc'

export function SettingsPage() {
	const settingsQuery = trpc.settings.get.useQuery()
	const utils = trpc.useUtils()
	const saveMutation = trpc.settings.save.useMutation({
		onSuccess: () => utils.settings.get.invalidate()
	})

	const [provider, setProvider] = useState<AiProvider>('gemini')
	const [apiKey, setApiKey] = useState('')
	const [editingKey, setEditingKey] = useState(false)
	const [batchLookups, setBatchLookups] = useState(false)
	const [modelFallback, setModelFallback] = useState(false)

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
										type="button"
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
		</div>
	)
}
