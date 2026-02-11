import { type FC, type ReactNode, useMemo } from 'react'
import { Tooltip } from '~/components/ui'
import type { RouterOutput } from '~/lib/trpc'
import { formatIngredientAmount } from '../utils/format'

type RecipeIngredient = RouterOutput['recipe']['get']['recipeIngredients'][number]

export interface HighlightedInstructionsProps {
	markdown: string
	ingredients: RecipeIngredient[]
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatTooltip(ri: RecipeIngredient): string {
	if (ri.displayUnit && ri.displayAmount) {
		return `${formatIngredientAmount(ri.displayAmount, ri.displayUnit)} (${Math.round(ri.amountGrams)}g)`
	}
	return `${Math.round(ri.amountGrams)}g`
}

function highlightText(text: string, ingredients: RecipeIngredient[], keyPrefix: string): ReactNode[] {
	const withIngredient = ingredients.filter(i => i.ingredient != null)
	if (withIngredient.length === 0) return [text]

	const sorted = [...withIngredient].sort((a, b) => b.ingredient!.name.length - a.ingredient!.name.length)
	const pattern = sorted.map(i => escapeRegex(i.ingredient!.name)).join('|')
	const regex = new RegExp(`\\b(${pattern})\\b`, 'gi')

	const result: ReactNode[] = []
	let lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			result.push(text.slice(lastIndex, match.index))
		}
		const ri = sorted.find(i => i.ingredient!.name.toLowerCase() === match![1].toLowerCase())
		if (ri) {
			result.push(
				<Tooltip key={`${keyPrefix}-${match.index}`} content={formatTooltip(ri)}>
					<span className="cursor-help text-accent underline decoration-accent/30 underline-offset-2">
						{match[0]}
					</span>
				</Tooltip>
			)
		}
		lastIndex = regex.lastIndex
	}

	if (lastIndex < text.length) {
		result.push(text.slice(lastIndex))
	}

	return result
}

/** Handles **bold**, *italic*, and ingredient highlighting within a line of text */
function renderInline(text: string, ingredients: RecipeIngredient[], keyPrefix: string): ReactNode[] {
	const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g
	const segments: ReactNode[] = []
	let lastIndex = 0
	let match: RegExpExecArray | null
	let key = 0

	while ((match = regex.exec(text)) !== null) {
		if (match.index > lastIndex) {
			segments.push(...highlightText(text.slice(lastIndex, match.index), ingredients, `${keyPrefix}-${key}`))
		}
		if (match[1] !== undefined) {
			segments.push(
				<strong key={`${keyPrefix}-b${key}`}>
					{highlightText(match[1], ingredients, `${keyPrefix}-b${key}`)}
				</strong>
			)
		} else if (match[2] !== undefined) {
			segments.push(
				<em key={`${keyPrefix}-i${key}`}>{highlightText(match[2], ingredients, `${keyPrefix}-i${key}`)}</em>
			)
		}
		key++
		lastIndex = regex.lastIndex
	}

	if (lastIndex < text.length) {
		segments.push(...highlightText(text.slice(lastIndex), ingredients, `${keyPrefix}-e`))
	}

	return segments
}

export const HighlightedInstructions: FC<HighlightedInstructionsProps> = ({ markdown, ingredients }) => {
	const elements = useMemo(() => {
		if (!markdown.trim()) {
			return [
				<p key="empty" className="text-ink-muted italic">
					No instructions provided.
				</p>
			]
		}

		const lines = markdown.split('\n')
		const blocks: ReactNode[] = []
		let i = 0
		let blockKey = 0

		while (i < lines.length) {
			const line = lines[i]

			if (line.trim() === '') {
				i++
				continue
			}

			// Heading
			const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
			if (headingMatch) {
				const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
				const Tag = `h${level}` as const
				const className = level <= 2 ? 'font-semibold text-base' : 'font-semibold text-sm'
				blocks.push(
					<Tag key={blockKey} className={className}>
						{renderInline(headingMatch[2], ingredients, `h${blockKey}`)}
					</Tag>
				)
				blockKey++
				i++
				continue
			}

			// Unordered list
			if (/^[-*]\s/.test(line)) {
				const items: ReactNode[] = []
				let itemKey = 0
				while (i < lines.length && /^[-*]\s/.test(lines[i])) {
					const content = lines[i].replace(/^[-*]\s+/, '')
					items.push(<li key={itemKey}>{renderInline(content, ingredients, `ul${blockKey}-${itemKey}`)}</li>)
					itemKey++
					i++
				}
				blocks.push(
					<ul key={blockKey} className="list-disc space-y-0.5 pl-5">
						{items}
					</ul>
				)
				blockKey++
				continue
			}

			// Ordered list
			if (/^\d+\.\s/.test(line)) {
				const items: ReactNode[] = []
				let itemKey = 0
				while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
					const content = lines[i].replace(/^\d+\.\s+/, '')
					items.push(<li key={itemKey}>{renderInline(content, ingredients, `ol${blockKey}-${itemKey}`)}</li>)
					itemKey++
					i++
				}
				blocks.push(
					<ol key={blockKey} className="list-decimal space-y-0.5 pl-5">
						{items}
					</ol>
				)
				blockKey++
				continue
			}

			// Paragraph — collect consecutive non-special lines
			const paraLines: string[] = []
			while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|[-*]\s|\d+\.\s)/.test(lines[i])) {
				paraLines.push(lines[i])
				i++
			}
			blocks.push(<p key={blockKey}>{renderInline(paraLines.join(' '), ingredients, `p${blockKey}`)}</p>)
			blockKey++
		}

		return blocks
	}, [markdown, ingredients])

	return (
		<div className="min-h-[150px] space-y-2 rounded-sm border border-edge bg-surface-1 px-3 py-2 text-ink text-sm">
			{elements}
		</div>
	)
}
