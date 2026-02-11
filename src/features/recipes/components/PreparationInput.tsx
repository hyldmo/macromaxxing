import { PREP_ADVERBS, PREP_DESCRIPTORS } from '@macromaxxing/db'
import { type FC, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '~/lib/cn'
import { FuzzyHighlight, type FuzzyResult, fuzzyMatch } from '~/lib/fuzzy'

export interface PreparationInputProps {
	value: string
	onChange: (value: string | null) => void
}

// Build suggestions: plain descriptors + common adverb+descriptor combos
const PREP_SUGGESTIONS = [
	...PREP_DESCRIPTORS,
	...PREP_ADVERBS.flatMap(adv =>
		PREP_DESCRIPTORS.slice(0, PREP_DESCRIPTORS.indexOf('peeled')).map(desc => `${adv} ${desc}`)
	)
]

export const PreparationInput: FC<PreparationInputProps> = ({ value, onChange }) => {
	const [draft, setDraft] = useState(value)
	const [focused, setFocused] = useState(false)
	const [showSuggestions, setShowSuggestions] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	const filteredSuggestions = draft
		? PREP_SUGGESTIONS.flatMap(s => {
				if (s === draft.toLowerCase()) return []
				const match = fuzzyMatch(draft, s)
				return match ? [{ text: s, match }] : []
			})
				.sort((a, b) => b.match.score - a.match.score)
				.slice(0, 12)
		: PREP_DESCRIPTORS.slice(0, 12).map(s => ({ text: s, match: null as FuzzyResult | null }))

	function getPos() {
		if (!inputRef.current) return null
		const rect = inputRef.current.getBoundingClientRect()
		return { top: rect.bottom + 2, left: rect.left }
	}

	function commit(val: string) {
		const trimmed = val.trim().toLowerCase()
		setDraft(trimmed)
		setShowSuggestions(false)
		setFocused(false)
		if (trimmed !== value) {
			onChange(trimmed || null)
		}
	}

	const pos = showSuggestions && focused ? getPos() : null
	const showDropdown = showSuggestions && focused && pos

	return (
		<div className="relative">
			<input
				ref={inputRef}
				type="text"
				value={draft}
				onChange={e => {
					setDraft(e.target.value)
					setShowSuggestions(true)
				}}
				onFocus={() => {
					setFocused(true)
					setShowSuggestions(true)
				}}
				onBlur={() => setTimeout(() => commit(draft), 150)}
				placeholder="prep..."
				className={cn(
					'h-5 border-0 bg-transparent px-0.5 font-normal text-ink-faint text-xs outline-none transition-colors [field-sizing:content] placeholder:text-transparent focus:min-w-24 focus:placeholder:text-ink-faint/50',
					!(focused || draft) && 'opacity-0 group-hover:opacity-100 group-hover:placeholder:text-ink-faint/50'
				)}
			/>
			{showDropdown &&
				createPortal(
					<div
						className="fixed z-50 max-h-32 w-36 overflow-y-auto rounded-sm border border-edge bg-surface-1 py-0.5"
						style={{ top: pos.top, left: pos.left }}
					>
						{filteredSuggestions.length > 0 ? (
							filteredSuggestions.map(({ text, match }) => (
								<button
									key={text}
									type="button"
									className="w-full px-2 py-0.5 text-left text-ink-muted text-xs hover:bg-surface-2 hover:text-ink"
									onMouseDown={e => {
										e.preventDefault()
										commit(text)
									}}
								>
									{match ? <FuzzyHighlight text={text} positions={match.positions} /> : text}
								</button>
							))
						) : (
							<div className="px-2 py-1 text-ink-faint text-xs">No results</div>
						)}
					</div>,
					document.body
				)}
		</div>
	)
}
