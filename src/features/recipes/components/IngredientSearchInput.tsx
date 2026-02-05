import type { Ingredient } from '@macromaxxing/db'
import { ClipboardPaste, Plus, Search, Sparkles } from 'lucide-react'
import { type FC, useRef, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { MacroBar } from './MacroBar'

export interface IngredientSearchInputProps {
	recipeId: RouterOutput['recipe']['get']['id']
}

interface ParsedIngredient {
	name: string
	grams: number
	displayUnit?: string
	displayAmount?: number
	status: 'pending' | 'found' | 'added' | 'error'
	error?: string
}

// Common unit patterns for parsing
const UNIT_PATTERNS = [
	// Volume units
	{ pattern: /(\d+(?:\.\d+)?)\s*tbsp\s+(.+)/i, unit: 'tbsp' },
	{ pattern: /(\d+(?:\.\d+)?)\s*tsp\s+(.+)/i, unit: 'tsp' },
	{ pattern: /(\d+(?:\.\d+)?)\s*cup(?:s)?\s+(.+)/i, unit: 'cup' },
	{ pattern: /(\d+(?:\.\d+)?)\s*dl\s+(.+)/i, unit: 'dl' },
	{ pattern: /(\d+(?:\.\d+)?)\s*ml\s+(.+)/i, unit: 'ml' },
	// Piece units
	{ pattern: /(\d+(?:\.\d+)?)\s*(?:pcs?|pieces?)\s+(.+)/i, unit: 'pcs' },
	{ pattern: /(\d+(?:\.\d+)?)\s*(?:scoop(?:s)?)\s+(.+)/i, unit: 'scoop' },
	// Size units
	{ pattern: /(\d+(?:\.\d+)?)\s*(?:small)\s+(.+)/i, unit: 'small' },
	{ pattern: /(\d+(?:\.\d+)?)\s*(?:medium)\s+(.+)/i, unit: 'medium' },
	{ pattern: /(\d+(?:\.\d+)?)\s*(?:large)\s+(.+)/i, unit: 'large' },
	// Grams (explicit)
	{ pattern: /(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(.+)/i, unit: 'g' },
	// Number only (assume pieces for whole items, grams for others)
	{ pattern: /(\d+(?:\.\d+)?)\s+(.+)/i, unit: null }
]

interface ParsedSingleIngredient {
	name: string
	amount: number
	unit: string | null
}

/** Parse a single ingredient string like "2 tbsp sugar" or "500g flour" */
function parseSingleIngredient(text: string): ParsedSingleIngredient | null {
	const trimmed = text.trim()
	if (!trimmed) return null

	for (const { pattern, unit } of UNIT_PATTERNS) {
		const match = trimmed.match(pattern)
		if (match) {
			const [, amountStr, name] = match
			const amount = Number.parseFloat(amountStr)
			if (!Number.isNaN(amount) && name.trim()) {
				return { name: name.trim(), amount, unit }
			}
		}
	}

	// Try reverse pattern: "sugar 500g"
	const reverseMatch = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*g?$/i)
	if (reverseMatch) {
		const [, name, amountStr] = reverseMatch
		const amount = Number.parseFloat(amountStr)
		if (!Number.isNaN(amount) && name.trim()) {
			return { name: name.trim(), amount, unit: 'g' }
		}
	}

	return null
}

function parseIngredientList(
	text: string,
	ingredients: Array<{ name: string; units?: Array<{ name: string; grams: number; isDefault: number }> }>
): ParsedIngredient[] {
	const lines = text.split('\n').filter(line => line.trim())
	const results: ParsedIngredient[] = []

	for (const line of lines) {
		let parsed = false

		// Try each unit pattern
		for (const { pattern, unit } of UNIT_PATTERNS) {
			const match = line.match(pattern)
			if (match) {
				const [, amountStr, name] = match
				const amount = Number.parseFloat(amountStr)

				if (!Number.isNaN(amount)) {
					// Find existing ingredient to lookup unit conversion
					const existingIng = ingredients.find(i => i.name.toLowerCase() === name.trim().toLowerCase())
					const ingUnits = existingIng?.units ?? []

					if (unit && unit !== 'g') {
						// Look up grams conversion from ingredient units
						const unitInfo = ingUnits.find(u => u.name.toLowerCase() === unit.toLowerCase())
						if (unitInfo) {
							results.push({
								grams: amount * unitInfo.grams,
								name: name.trim(),
								displayUnit: unit,
								displayAmount: amount,
								status: existingIng ? 'found' : 'pending'
							})
						} else {
							// Unit not found - store with estimated grams, will be updated after AI lookup
							results.push({
								grams: amount * 100, // Placeholder, will need unit info
								name: name.trim(),
								displayUnit: unit,
								displayAmount: amount,
								status: 'pending'
							})
						}
					} else if (unit === 'g') {
						results.push({
							grams: amount,
							name: name.trim(),
							status: existingIng ? 'found' : 'pending'
						})
					} else {
						// No unit specified - check if ingredient has a default piece unit
						const defaultUnit = ingUnits.find(u => u.isDefault && u.name !== 'g')
						if (defaultUnit) {
							results.push({
								grams: amount * defaultUnit.grams,
								name: name.trim(),
								displayUnit: defaultUnit.name,
								displayAmount: amount,
								status: 'found'
							})
						} else {
							// Assume grams
							results.push({
								grams: amount,
								name: name.trim(),
								status: existingIng ? 'found' : 'pending'
							})
						}
					}
					parsed = true
					break
				}
			}
		}

		// Try reverse pattern: "Pasta 500g"
		if (!parsed) {
			const reverseMatch = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*g?$/i)
			if (reverseMatch) {
				const [, name, amountStr] = reverseMatch
				const amount = Number.parseFloat(amountStr)
				if (!Number.isNaN(amount)) {
					const existingIng = ingredients.find(i => i.name.toLowerCase() === name.trim().toLowerCase())
					results.push({
						grams: amount,
						name: name.trim(),
						status: existingIng ? 'found' : 'pending'
					})
				}
			}
		}
	}

	return results
}

export const IngredientSearchInput: FC<IngredientSearchInputProps> = ({ recipeId }) => {
	const [search, setSearch] = useState('')
	const [showDropdown, setShowDropdown] = useState(false)
	const [pastedIngredients, setPastedIngredients] = useState<ParsedIngredient[]>([])
	const [isProcessingPaste, setIsProcessingPaste] = useState(false)
	const [pasteError, setPasteError] = useState<Error | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const utils = trpc.useUtils()

	const ingredientsQuery = trpc.ingredient.listPublic.useQuery()
	const findOrCreate = trpc.ingredient.findOrCreate.useMutation({
		onSuccess: () => utils.ingredient.listPublic.invalidate()
	})
	const addIngredient = trpc.recipe.addIngredient.useMutation({
		onSuccess: () => {
			utils.recipe.getPublic.invalidate({ id: recipeId })
		}
	})

	// Parse search input for amount/unit
	const parsedSearch = parseSingleIngredient(search)
	const searchName = parsedSearch?.name ?? search

	const filtered =
		ingredientsQuery.data?.filter(i => i.name.toLowerCase().includes(searchName.toLowerCase())).slice(0, 10) ?? []

	function handleSelectIngredient(
		ingredientId: Ingredient['id'],
		amountGrams = 100,
		displayUnit?: string,
		displayAmount?: number
	) {
		addIngredient.mutate({
			recipeId,
			ingredientId,
			amountGrams,
			displayUnit: displayUnit ?? null,
			displayAmount: displayAmount ?? null
		})
		setSearch('')
		setShowDropdown(false)
	}

	async function handleFindOrCreate(name?: string, grams?: number, displayUnit?: string, displayAmount?: number) {
		const ingredientName = name ?? search.trim()
		if (!ingredientName) return

		const { ingredient } = await findOrCreate.mutateAsync({ name: ingredientName })

		// If we had a display unit but no exact grams, recalculate using the new ingredient's units
		let finalGrams = grams ?? 100
		const finalDisplayUnit = displayUnit
		const finalDisplayAmount = displayAmount

		if (displayUnit && displayAmount && ingredient.units) {
			const unitInfo = ingredient.units.find(
				(u: { name: string; grams: number }) => u.name.toLowerCase() === displayUnit.toLowerCase()
			)
			if (unitInfo) {
				finalGrams = displayAmount * unitInfo.grams
			}
		}

		addIngredient.mutate({
			recipeId,
			ingredientId: ingredient.id,
			amountGrams: finalGrams,
			displayUnit: finalDisplayUnit ?? null,
			displayAmount: finalDisplayAmount ?? null
		})

		if (!name) {
			setSearch('')
			setShowDropdown(false)
		}
		return ingredient
	}

	function handlePaste(e: React.ClipboardEvent) {
		const text = e.clipboardData.getData('text')
		const ingredients = ingredientsQuery.data ?? []
		const parsed = parseIngredientList(text, ingredients)
		if (parsed.length > 1) {
			e.preventDefault()
			setPastedIngredients(parsed)
			setPasteError(null)
			setShowDropdown(false)
		}
	}

	async function handleAddPastedIngredients(itemsToProcess?: ParsedIngredient[]) {
		setIsProcessingPaste(true)
		setPasteError(null)
		const updated = [...(itemsToProcess ?? pastedIngredients)]

		for (let i = 0; i < updated.length; i++) {
			const item = updated[i]
			if (item.status === 'added' || item.status === 'error') continue

			try {
				// Backend handles DB lookup + AI fallback
				await handleFindOrCreate(item.name, item.grams, item.displayUnit, item.displayAmount)
				updated[i] = { ...item, status: 'added' }
				setPastedIngredients([...updated])
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error'
				updated[i] = { ...item, status: 'error', error: errorMsg }
				setPastedIngredients([...updated])
				setPasteError(err as Error)
				setIsProcessingPaste(false)
				return // Stop processing on first error
			}
		}

		// All done successfully
		setPastedIngredients([])
		setIsProcessingPaste(false)
		utils.recipe.getPublic.invalidate({ id: recipeId })
	}

	function cancelPaste() {
		setPastedIngredients([])
		setPasteError(null)
		findOrCreate.reset()
	}

	function retryPaste() {
		setPasteError(null)
		findOrCreate.reset()
		// Reset failed items back to pending so they get processed
		const resetItems = pastedIngredients.map(item =>
			item.status === 'error' ? { ...item, status: 'pending' as const, error: undefined } : item
		)
		setPastedIngredients(resetItems)
		handleAddPastedIngredients(resetItems)
	}

	// Show paste preview mode
	if (pastedIngredients.length > 0) {
		const hasErrors = pastedIngredients.some(i => i.status === 'error')
		const allAdded = pastedIngredients.every(i => i.status === 'added')

		return (
			<div className="rounded-[--radius-md] border border-edge bg-surface-1 p-3">
				<div className="mb-2 flex items-center gap-2 text-ink-muted text-sm">
					<ClipboardPaste className="size-4" />
					<span>
						{isProcessingPaste
							? `Adding ingredients... (${pastedIngredients.filter(i => i.status === 'added').length}/${
									pastedIngredients.length
								})`
							: `Parsed ${pastedIngredients.length} ingredients from paste`}
					</span>
				</div>
				<div className="mb-3 space-y-1">
					{pastedIngredients.map(item => (
						<div key={`${item.grams}-${item.name}`} className="flex items-center gap-2 text-sm">
							<span className="w-20 text-right font-mono text-ink-muted">
								{item.displayUnit && item.displayAmount
									? `${item.displayAmount} ${item.displayUnit}`
									: `${item.grams}g`}
							</span>
							<span className={item.status === 'error' ? 'text-destructive' : 'text-ink'}>
								{item.name}
							</span>
							{item.displayUnit && item.status !== 'error' && (
								<span className="text-ink-faint text-xs">({Math.round(item.grams)}g)</span>
							)}
							{item.status === 'found' && <span className="text-success text-xs">✓ found</span>}
							{item.status === 'pending' && <span className="text-accent text-xs">+ AI lookup</span>}
							{item.status === 'added' && <span className="text-success text-xs">✓ added</span>}
							{item.status === 'error' && <span className="text-destructive text-xs">✗ failed</span>}
						</div>
					))}
				</div>

				{pasteError && <TRPCError error={findOrCreate.error} className="mb-3" />}

				<div className="flex gap-2">
					{hasErrors ? (
						<>
							<Button onClick={retryPaste} disabled={isProcessingPaste}>
								<Sparkles className="size-4" />
								Retry Failed
							</Button>
							<Button variant="ghost" onClick={cancelPaste}>
								Dismiss
							</Button>
						</>
					) : allAdded ? (
						<Button variant="ghost" onClick={cancelPaste}>
							Done
						</Button>
					) : (
						<>
							<Button onClick={() => handleAddPastedIngredients()} disabled={isProcessingPaste}>
								{isProcessingPaste ? (
									<>
										<Spinner className="size-4" />
										Adding...
									</>
								) : (
									<>
										<Plus className="size-4" />
										Add All
									</>
								)}
							</Button>
							<Button variant="ghost" onClick={cancelPaste} disabled={isProcessingPaste}>
								Cancel
							</Button>
						</>
					)}
				</div>
			</div>
		)
	}

	return (
		<div className="relative">
			<div className="relative">
				<Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" />
				<Input
					ref={inputRef}
					placeholder="Search, add, or paste ingredient list..."
					value={search}
					onChange={e => {
						setSearch(e.target.value)
						setShowDropdown(true)
					}}
					onFocus={() => setShowDropdown(true)}
					onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
					onPaste={handlePaste}
					className="pl-8"
				/>
			</div>
			{showDropdown && search.length > 0 && (
				<div className="absolute top-full z-10 mt-1 w-full rounded-[--radius-md] border border-edge bg-surface-1 shadow-black/30 shadow-lg">
					{filtered.map(ingredient => {
						// If user typed amount/unit, use that. Otherwise use default unit or 100g
						let amountGrams: number
						let displayUnit: string | undefined
						let displayAmount: number | undefined

						if (parsedSearch) {
							const { amount, unit } = parsedSearch
							if (unit && unit !== 'g') {
								// Look up unit conversion from ingredient
								const unitInfo = ingredient.units?.find(
									u => u.name.toLowerCase() === unit.toLowerCase()
								)
								if (unitInfo) {
									amountGrams = amount * unitInfo.grams
									displayUnit = unit
									displayAmount = amount
								} else {
									// Unit not found on ingredient, fall back to grams
									amountGrams = amount
								}
							} else {
								// Explicit grams or no unit specified with number
								amountGrams = amount
							}
						} else {
							// No parsed input - use default unit if available
							const defaultUnit = ingredient.units?.find(u => u.isDefault)
							amountGrams = defaultUnit ? defaultUnit.grams : 100
							displayUnit = defaultUnit && defaultUnit.name !== 'g' ? defaultUnit.name : undefined
							displayAmount = displayUnit ? 1 : undefined
						}

						return (
							<button
								key={ingredient.id}
								type="button"
								className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2"
								onMouseDown={() =>
									handleSelectIngredient(ingredient.id, amountGrams, displayUnit, displayAmount)
								}
							>
								<div className="flex w-full items-center gap-2">
									<Plus className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
									<span className="text-ink text-sm">{ingredient.name}</span>
									<span className="ml-auto font-mono text-ink-faint text-xs">
										{ingredient.protein}p {ingredient.carbs}c {ingredient.fat}f
									</span>
								</div>
								<div className="ml-5.5">
									<MacroBar
										protein={ingredient.protein}
										carbs={ingredient.carbs}
										fat={ingredient.fat}
									/>
								</div>
							</button>
						)
					})}
					{filtered.length === 0 && !findOrCreate.isPending && (
						<div className="px-3 py-2 text-ink-faint text-sm">No ingredients found</div>
					)}
					<button
						type="button"
						className="flex w-full items-center gap-2 border-edge border-t px-3 py-2.5 text-left text-accent text-sm hover:bg-surface-2"
						onMouseDown={() => {
							if (parsedSearch) {
								const { name, amount, unit } = parsedSearch
								// Pass unit info - grams will be recalculated after AI lookup
								handleFindOrCreate(
									name,
									unit === 'g' ? amount : amount * 100, // Placeholder grams if unit specified
									unit && unit !== 'g' ? unit : undefined,
									unit && unit !== 'g' ? amount : undefined
								)
							} else {
								handleFindOrCreate()
							}
						}}
						disabled={findOrCreate.isPending}
					>
						{findOrCreate.isPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
						Add "
						{parsedSearch
							? `${parsedSearch.amount} ${parsedSearch.unit ?? ''} ${parsedSearch.name}`.trim()
							: search}
						"
					</button>
					{findOrCreate.isError && <TRPCError error={findOrCreate.error} />}
					{addIngredient.isError && <TRPCError error={addIngredient.error} />}
				</div>
			)}
		</div>
	)
}
