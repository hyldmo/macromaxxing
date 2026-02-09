import { PREP_ADVERBS, PREP_DESCRIPTORS } from '@macromaxxing/db'
import { type FC, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '~/lib/cn'

export interface PreparationInputProps {
	value: string
	onChange: (value: string | null) => void
}

const DESCRIPTORS = [...PREP_DESCRIPTORS]
const ADVERBS = [...PREP_ADVERBS]

// Build suggestions: plain descriptors + common adverb+descriptor combos
const PREP_SUGGESTIONS = [
	...DESCRIPTORS,
	...ADVERBS.flatMap(adv => DESCRIPTORS.slice(0, 6).map(desc => `${adv} ${desc}`))
]

export const PreparationInput: FC<PreparationInputProps> = ({ value, onChange }) => {
	const [draft, setDraft] = useState(value)
	const [focused, setFocused] = useState(false)
	const [showSuggestions, setShowSuggestions] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	const filteredSuggestions = draft
		? PREP_SUGGESTIONS.filter(s => s.includes(draft.toLowerCase()) && s !== draft.toLowerCase()).slice(0, 12)
		: DESCRIPTORS.slice(0, 12)

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
	const showDropdown = showSuggestions && focused && filteredSuggestions.length > 0 && pos

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
					'h-5 w-32 border-0 bg-transparent px-0.5 font-normal text-ink-faint text-xs outline-none transition-colors placeholder:text-transparent focus:placeholder:text-ink-faint/50',
					!(focused || draft) && 'opacity-0 group-hover:opacity-100 group-hover:placeholder:text-ink-faint/50'
				)}
			/>
			{showDropdown &&
				createPortal(
					<div
						className="fixed z-50 max-h-32 w-36 overflow-y-auto rounded-[--radius-sm] border border-edge bg-surface-1 py-0.5"
						style={{ top: pos.top, left: pos.left }}
					>
						{filteredSuggestions.map(s => (
							<button
								key={s}
								type="button"
								className="w-full px-2 py-0.5 text-left text-ink-muted text-xs hover:bg-surface-2 hover:text-ink"
								onMouseDown={e => {
									e.preventDefault()
									commit(s)
								}}
							>
								{s}
							</button>
						))}
					</div>,
					document.body
				)}
		</div>
	)
}
