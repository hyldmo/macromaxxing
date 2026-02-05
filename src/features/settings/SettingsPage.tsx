import { AI_PROVIDER_OPTIONS, type AiProvider } from '@macromaxxing/db'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Spinner } from '~/components/ui'
import { Button } from '~/components/ui/Button'
import { Card, CardContent, CardHeader } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'

export function SettingsPage() {
	const settingsQuery = trpc.settings.get.useQuery()
	const saveMutation = trpc.settings.save.useMutation({
		onSuccess: () => {
			utils.settings.get.invalidate()
			setApiKey('')
		}
	})
	const utils = trpc.useUtils()

	const [provider, setProvider] = useState<AiProvider>('gemini')
	const [apiKey, setApiKey] = useState('')

	const savedProvider = settingsQuery.data?.provider
	const hasExistingKey = settingsQuery.data?.hasKey
	const providerChanged = savedProvider && provider !== savedProvider

	useEffect(() => {
		if (savedProvider) {
			setProvider(savedProvider)
		}
	}, [savedProvider])

	function handleSave(e: React.FormEvent) {
		e.preventDefault()
		saveMutation.mutate({
			provider,
			apiKey: apiKey || undefined
		})
	}

	const canSave = apiKey || providerChanged
	const buttonText = saveMutation.isPending ? (apiKey ? 'Verifying...' : 'Saving...') : 'Save'

	return (
		<div className="space-y-3">
			<h1 className="font-semibold text-ink">Settings</h1>

			{settingsQuery.error && <TRPCError error={settingsQuery.error} />}

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
										className={`rounded-[--radius-sm] border px-3 py-1 text-sm transition-colors ${
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

						<label className="block space-y-1">
							<span className="text-ink-muted text-sm">API Key</span>
							<Input
								type="password"
								name="apiKey"
								placeholder={hasExistingKey ? 'Key saved (enter new to update)' : 'Enter API key'}
								autoComplete="off"
								value={apiKey}
								onChange={e => setApiKey(e.target.value)}
							/>
						</label>

						<div className="flex gap-2">
							<Button type="submit" disabled={!canSave || saveMutation.isPending}>
								{buttonText}
							</Button>
							{saveMutation.isPending && <Spinner className="size-4" />}
							{saveMutation.isSuccess && (
								<span className="flex items-center gap-1 text-sm text-success">
									<Check className="size-4" /> Saved
								</span>
							)}
						</div>
						{saveMutation.isError && <TRPCError error={saveMutation.error} />}
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
