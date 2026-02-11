import type { FC, ReactNode } from 'react'

export interface FuzzyResult {
	score: number
	positions: number[]
}

/** Multi-word fuzzy search: each query word must appear as a substring in text */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
	const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return null

	const textLower = text.toLowerCase()
	const positions: number[] = []
	const used = new Set<number>()
	let score = 0

	// Match longest words first to avoid overlap conflicts
	const sorted = [...words].sort((a, b) => b.length - a.length)

	for (const word of sorted) {
		let bestIdx = -1
		let bestScore = -1
		let from = 0

		while (from <= textLower.length - word.length) {
			const idx = textLower.indexOf(word, from)
			if (idx === -1) break

			let overlaps = false
			for (let i = idx; i < idx + word.length; i++) {
				if (used.has(i)) {
					overlaps = true
					break
				}
			}

			if (!overlaps) {
				const s = idx === 0 ? 10 : textLower[idx - 1] === ' ' ? 7 : 1
				if (s > bestScore) {
					bestIdx = idx
					bestScore = s
				}
			}

			from = idx + 1
		}

		if (bestIdx === -1) return null

		for (let i = bestIdx; i < bestIdx + word.length; i++) {
			positions.push(i)
			used.add(i)
		}
		score += bestScore + word.length
	}

	// Prefer shorter texts (more specific matches)
	score -= text.length * 0.1

	return { score, positions: positions.sort((a, b) => a - b) }
}

export const FuzzyHighlight: FC<{ text: string; positions: number[] }> = ({ text, positions }) => {
	if (positions.length === 0) return <>{text}</>
	const posSet = new Set(positions)
	const parts: ReactNode[] = []
	let i = 0
	while (i < text.length) {
		const highlighted = posSet.has(i)
		let end = i + 1
		while (end < text.length && posSet.has(end) === highlighted) end++
		parts.push(
			highlighted ? (
				<span key={i} className="font-semibold text-accent">
					{text.slice(i, end)}
				</span>
			) : (
				<span key={i}>{text.slice(i, end)}</span>
			)
		)
		i = end
	}
	return <>{parts}</>
}
