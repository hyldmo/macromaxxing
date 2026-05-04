import type { FC } from 'react'
import { cn } from '~/lib'
import { SectionShell } from '../components'

const SPEC_ROWS: Array<{ key: string; value: string; body: string }> = [
	{
		key: 'AI providers',
		value: 'Gemini / OpenAI / Anthropic',
		body: 'Bring your own key. Swap providers per request. Fallback chain handles 429s.'
	},
	{
		key: 'Key storage',
		value: 'AES-GCM',
		body: 'Encrypted at rest on Cloudflare D1. Decrypted only at request time. Never leaves your account.'
	},
	{
		key: 'Food database',
		value: '14,328 foods local',
		body: 'USDA Foundation + SR Legacy, indexed with SQLite FTS5. Queries in under 10 ms at the edge.'
	},
	{
		key: 'Offline mode',
		value: 'PWA · Workbox',
		body: 'Installable to home screen. Workbox precaches assets. Plan a week from the gym with no signal.'
	},
	{
		key: 'External API',
		value: 'MCP server · bearer',
		body: 'Point Claude, Cursor, or any MCP client at /api/mcp. Personal tokens scoped per device.'
	},
	{
		key: 'Infra',
		value: 'Cloudflare D1 + R2',
		body: 'SQLite at the edge for data. R2 for recipe images. Hono + tRPC on Pages Functions.'
	}
]

export const IntelligenceSection: FC = () => (
	<SectionShell
		id="instrument"
		marker="§ 03 / Instrument"
		title="Built to be trusted."
		kicker="The tooling underneath. Encrypted, portable, scriptable. Nothing you can't walk away from."
	>
		<div className="overflow-hidden border border-edge">
			{SPEC_ROWS.map((row, i) => (
				<div
					key={row.key}
					className={cn(
						'grid gap-4 px-6 py-5 font-mono md:grid-cols-[180px_240px_1fr] md:gap-10 md:px-8 md:py-6',
						i !== 0 && 'border-edge border-t'
					)}
				>
					<div className="text-[10px] text-ink-faint uppercase tracking-[0.25em]">
						{String(i + 1).padStart(2, '0')} · {row.key}
					</div>
					<div className="font-display text-ink text-xl tracking-tight md:text-2xl">{row.value}</div>
					<div className="font-display text-base text-ink-muted leading-relaxed">{row.body}</div>
				</div>
			))}
		</div>
	</SectionShell>
)
