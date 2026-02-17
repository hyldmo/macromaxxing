import { Check } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { cn } from '~/lib/cn'

export interface CookInstructionStepsProps {
	markdown: string
}

interface ParsedBlock {
	type: 'heading' | 'step'
	text: string
}

function parseSteps(markdown: string): ParsedBlock[] {
	const lines = markdown.split('\n')
	const blocks: ParsedBlock[] = []
	let i = 0

	while (i < lines.length) {
		const line = lines[i]

		if (line.trim() === '') {
			i++
			continue
		}

		// Heading → non-checkable section divider
		const headingMatch = line.match(/^#{1,6}\s+(.+)/)
		if (headingMatch) {
			blocks.push({ type: 'heading', text: headingMatch[1] })
			i++
			continue
		}

		// Ordered list item
		if (/^\d+\.\s/.test(line)) {
			blocks.push({ type: 'step', text: line.replace(/^\d+\.\s+/, '') })
			i++
			continue
		}

		// Unordered list item
		if (/^[-*]\s/.test(line)) {
			blocks.push({ type: 'step', text: line.replace(/^[-*]\s+/, '') })
			i++
			continue
		}

		// Paragraph — collect consecutive non-special lines
		const paraLines: string[] = []
		while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i])) {
			paraLines.push(lines[i])
			i++
		}
		blocks.push({ type: 'step', text: paraLines.join(' ') })
	}

	return blocks
}

/** Strip markdown bold/italic markers for plain text display */
function stripMarkdown(text: string): string {
	return text.replaceAll(/\*\*(.+?)\*\*/g, '$1').replaceAll(/\*(.+?)\*/g, '$1')
}

export const CookInstructionSteps: FC<CookInstructionStepsProps> = ({ markdown }) => {
	const blocks = useMemo(() => parseSteps(markdown), [markdown])
	const [checked, setChecked] = useState<Set<number>>(new Set())

	const steps = blocks.filter(b => b.type === 'step')
	const stepCount = steps.length
	const checkedCount = checked.size

	let stepIndex = 0

	const toggle = (idx: number) => {
		setChecked(prev => {
			const next = new Set(prev)
			if (next.has(idx)) next.delete(idx)
			else next.add(idx)
			return next
		})
	}

	return (
		<div>
			<div className="mb-2 flex items-center gap-2 px-1">
				<h3 className="font-semibold text-ink-muted text-xs uppercase tracking-wider">Method</h3>
				<span className="font-mono text-ink-faint text-xs tabular-nums">
					{checkedCount}/{stepCount}
				</span>
			</div>
			<div className="space-y-1">
				{blocks.map(block => {
					if (block.type === 'heading') {
						return (
							<div key={`h-${block.text}`} className="px-3 pt-2 pb-1 font-semibold text-ink text-sm">
								{stripMarkdown(block.text)}
							</div>
						)
					}

					const currentStep = stepIndex++
					const isChecked = checked.has(currentStep)
					return (
						<button
							key={`s-${currentStep}`}
							type="button"
							onClick={() => toggle(currentStep)}
							className={cn(
								'flex w-full items-start gap-3 rounded-sm px-3 py-2 text-left transition-colors',
								isChecked ? 'bg-surface-2/50 opacity-50' : 'hover:bg-surface-2/50'
							)}
						>
							<div
								className={cn(
									'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors',
									isChecked ? 'border-accent bg-accent' : 'border-edge bg-surface-1'
								)}
							>
								{isChecked && <Check className="size-3.5 text-surface-0" />}
							</div>
							<span className={cn('flex-1 text-ink text-sm', isChecked && 'line-through')}>
								{stripMarkdown(block.text)}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}
