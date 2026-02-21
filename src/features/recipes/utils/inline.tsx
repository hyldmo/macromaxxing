import type { ReactNode } from 'react'
import { Tooltip } from '~/components/ui'
import type { RouterOutput } from '~/lib/trpc'
import { formatIngredientAmount } from './format'

export type RecipeIngredient = RouterOutput['recipe']['get']['recipeIngredients'][number]

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

	const sorted = withIngredient.toSorted((a, b) => b.ingredient!.name.length - a.ingredient!.name.length)
	const pattern = sorted.map(i => escapeRegex(i.ingredient!.name)).join('|')
	const regex = new RegExp(`\\b(${pattern})\\b`, 'gi')

	const result: ReactNode[] = []
	let lastIndex = 0
	let match: RegExpExecArray | null

	while (true) {
		match = regex.exec(text)
		if (match === null) break
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
export function renderInline(text: string, ingredients: RecipeIngredient[], keyPrefix: string): ReactNode[] {
	const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g
	const segments: ReactNode[] = []
	let lastIndex = 0
	let match: RegExpExecArray | null
	let key = 0

	while (true) {
		match = regex.exec(text)
		if (match === null) break
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
