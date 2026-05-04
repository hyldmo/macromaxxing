import type { FC, ReactNode } from 'react'
import { cn } from '~/lib'
import { SectionShell } from '../components'

const FAQ_ITEMS: Array<{ q: string; a: ReactNode }> = [
	{
		q: 'Is it free?',
		a: (
			<>
				The app is free. For nutrition lookups that miss the local USDA database, bring your own AI key —{' '}
				<span className="font-mono">Gemini</span>, <span className="font-mono">OpenAI</span>, or{' '}
				<span className="font-mono">Anthropic</span>. Barcode scanning and the local food DB work without any
				key at all.
			</>
		)
	},
	{
		q: 'Is the source code available?',
		a: (
			<>
				Yes. Macromaxxing is open source. Read the code, file an issue, or send a PR at{' '}
				<a
					href="https://github.com/hyldmo/macromaxxing"
					target="_blank"
					rel="noreferrer"
					className="font-mono text-accent underline underline-offset-2 hover:text-ink"
				>
					github.com/hyldmo/macromaxxing
				</a>
				. Self-host it if you want.
			</>
		)
	},
	{
		q: 'Does it work offline?',
		a: (
			<>
				Yes. It is a PWA. Install to home screen, cache assets, plan a week with no signal. Mutations sync when
				the connection returns.
			</>
		)
	},
	{
		q: 'Is this a recipe app or a training app?',
		a: (
			<>
				Both. That is the point. Meal prep and strength training share an audience — and a user's week. One
				instrument for both.
			</>
		)
	},
	{
		q: 'Do you sell my data or train models on it?',
		a: (
			<>
				No. Your recipes, workouts, and AI keys are yours. Keys are encrypted at rest with AES-GCM and decrypted
				only when you make a request.
			</>
		)
	},
	{
		q: 'Can I connect other tools?',
		a: (
			<>
				Yes. The app exposes an MCP server at <span className="font-mono">/api/mcp</span>. Create a personal
				access token in Settings and point Claude, Cursor, or any MCP-aware client at it.
			</>
		)
	},
	{
		q: 'What about barcode labels that are not in the database?',
		a: (
			<>
				Paste a link to the product page — the app parses JSON-LD Product schema, falling back to AI. Or type
				the label values directly and the recipe will be treated as a premade meal.
			</>
		)
	}
]

export const FaqSection: FC = () => (
	<SectionShell id="faq" marker="§ 05 / Notes" title="Questions." kicker="Plain answers. No accordions.">
		<ol className="border border-edge">
			{FAQ_ITEMS.map((item, i) => (
				<li
					key={item.q}
					className={cn(
						'grid gap-4 px-6 py-7 md:grid-cols-[80px_1fr_2fr] md:gap-10 md:px-8',
						i !== 0 && 'border-edge border-t'
					)}
				>
					<span className="font-mono text-[10px] text-ink-faint uppercase tracking-[0.25em]">
						Q · {String(i + 1).padStart(2, '0')}
					</span>
					<h3 className="font-display font-normal text-ink text-xl leading-tight tracking-tight md:text-2xl">
						{item.q}
					</h3>
					<p className="font-display text-base text-ink-muted leading-relaxed">{item.a}</p>
				</li>
			))}
		</ol>
	</SectionShell>
)
