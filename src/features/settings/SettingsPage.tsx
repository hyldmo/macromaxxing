import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Card, CardContent, CardHeader } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { trpc } from '~/lib/trpc'

const providers = [
	{ value: 'gemini', label: 'Gemini', defaultModel: 'gemini-2.0-flash' },
	{ value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini' },
	{ value: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514' }
] as const

type Provider = (typeof providers)[number]['value']

export function SettingsPage() {
	const settingsQuery = trpc.settings.get.useQuery()
	const saveMutation = trpc.settings.save.useMutation({
		onSuccess: () => utils.settings.get.invalidate()
	})
	const utils = trpc.useUtils()

	const [provider, setProvider] = useState<Provider>('gemini')
	const [apiKey, setApiKey] = useState('')
	const [model, setModel] = useState('gemini-2.0-flash')

	useEffect(() => {
		if (settingsQuery.data) {
			setProvider(settingsQuery.data.provider as Provider)
			setModel(settingsQuery.data.model)
		}
	}, [settingsQuery.data])

	function handleProviderChange(p: Provider) {
		setProvider(p)
		const defaultModel = providers.find(pr => pr.value === p)?.defaultModel ?? ''
		setModel(defaultModel)
	}

	function handleSave(e: React.FormEvent) {
		e.preventDefault()
		saveMutation.mutate({ provider, apiKey, model })
	}

	return (
		<div className="space-y-3">
			<h1 className="font-semibold text-ink">Settings</h1>

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
								{providers.map(p => (
									<button
										key={p.value}
										type="button"
										onClick={() => handleProviderChange(p.value)}
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

						<label>
							<span className="mb-1 block text-ink-muted text-sm">API Key</span>
							<Input
								type="password"
								placeholder={
									settingsQuery.data?.hasKey ? 'Key saved (enter new to update)' : 'Enter API key'
								}
								value={apiKey}
								onChange={e => setApiKey(e.target.value)}
							/>
						</label>

						<label>
							<span className="mb-1 block text-ink-muted text-sm">Model</span>
							<Input value={model} onChange={e => setModel(e.target.value)} placeholder="Model name" />
						</label>

						<div className="flex items-center gap-3">
							<Button type="submit" disabled={!apiKey || saveMutation.isPending}>
								{saveMutation.isPending ? <Spinner className="h-4 w-4" /> : 'Save'}
							</Button>
							{saveMutation.isSuccess && (
								<span className="flex items-center gap-1 text-sm text-success">
									<Check className="h-4 w-4" /> Saved
								</span>
							)}
							{saveMutation.isError && (
								<span className="text-destructive text-sm">{saveMutation.error.message}</span>
							)}
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
