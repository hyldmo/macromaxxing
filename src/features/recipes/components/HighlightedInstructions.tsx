import { type FC, type ReactNode, useMemo } from 'react'
import { type RecipeIngredient, renderInline } from '../utils/inline'

export interface HighlightedInstructionsProps {
	markdown: string
	ingredients: RecipeIngredient[]
}

/** Collect indented list sub-items following a parent item */
function collectSubLines(lines: string[], start: number): string[] {
	const items: string[] = []
	let i = start
	while (i < lines.length) {
		const match = lines[i].match(/^[\t ]+(?:\d+\.\s+|[-*]\s+)(.+)/)
		if (match) {
			items.push(match[1])
			i++
		} else {
			break
		}
	}
	return items
}

/** Render collected sub-items as a nested ordered list */
function renderSubList(subItems: string[], ingredients: RecipeIngredient[], keyPrefix: string): ReactNode {
	return (
		<ol className="mt-1 list-[lower-alpha] space-y-0.5 pl-5">
			{subItems.map((item, idx) => (
				<li key={item}>{renderInline(item, ingredients, `${keyPrefix}-${idx}`)}</li>
			))}
		</ol>
	)
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
					const subItems = collectSubLines(lines, i + 1)
					i += 1 + subItems.length
					items.push(
						<li key={itemKey}>
							{renderInline(content, ingredients, `ul${blockKey}-${itemKey}`)}
							{subItems.length > 0 &&
								renderSubList(subItems, ingredients, `ul${blockKey}-${itemKey}-sub`)}
						</li>
					)
					itemKey++
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
					const subItems = collectSubLines(lines, i + 1)
					i += 1 + subItems.length
					items.push(
						<li key={itemKey}>
							{renderInline(content, ingredients, `ol${blockKey}-${itemKey}`)}
							{subItems.length > 0 &&
								renderSubList(subItems, ingredients, `ol${blockKey}-${itemKey}-sub`)}
						</li>
					)
					itemKey++
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
