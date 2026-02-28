import { extractPreparation, type Ingredient } from '@macromaxxing/db'
import { BookOpen, ClipboardPaste, Database, Plus, ScanLine, Search, Sparkles } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Input, Spinner, TRPCError } from '~/components/ui'
import type { OFFProduct } from '~/lib'
import { FuzzyHighlight, fuzzyMatch, useUser } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { calculateRecipeTotals, getEffectiveCookedWeight, getEffectivePortionSize } from '../utils/macros'
import { BarcodeScanDialog } from './BarcodeScanDialog'
import { MacroBar } from './MacroBar'

export interface IngredientSearchInputProps {
	recipeId: RouterOutput['recipe']['get']['id']
	onAddPending?: (name: string) => void
	onRemovePending?: (name: string) => void
}

interface ParsedIngredient {
	name: string
	grams: number
	displayUnit?: string
	displayAmount?: number
	preparation?: string | null
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
	preparation: string | null
}

/** Parse a single ingredient string like "2 tbsp sugar" or "500g flour" */
function parseSingleIngredient(text: string): ParsedSingleIngredient | null {
	const trimmed = text.trim()
	if (!trimmed) return null

	for (const { pattern, unit } of UNIT_PATTERNS) {
		const match = trimmed.match(pattern)
		if (match) {
			const [, amountStr, rawName] = match
			const amount = Number.parseFloat(amountStr)
			if (!Number.isNaN(amount) && rawName.trim()) {
				const { name, preparation } = extractPreparation(rawName.trim())
				return { name, amount, unit, preparation }
			}
		}
	}

	// Try reverse pattern: "sugar 500g"
	const reverseMatch = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*g?$/i)
	if (reverseMatch) {
		const [, rawName, amountStr] = reverseMatch
		const amount = Number.parseFloat(amountStr)
		if (!Number.isNaN(amount) && rawName.trim()) {
			const { name, preparation } = extractPreparation(rawName.trim())
			return { name, amount, unit: 'g', preparation }
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
				const [, amountStr, rawName] = match
				const amount = Number.parseFloat(amountStr)

				if (!Number.isNaN(amount)) {
					const { name, preparation } = extractPreparation(rawName.trim())
					// Find existing ingredient to lookup unit conversion
					const existingIng = ingredients.find(i => i.name.toLowerCase() === name.toLowerCase())
					const ingUnits = existingIng?.units ?? []

					if (unit && unit !== 'g') {
						// Look up grams conversion from ingredient units
						const unitInfo = ingUnits.find(u => u.name.toLowerCase() === unit.toLowerCase())
						if (unitInfo) {
							results.push({
								grams: amount * unitInfo.grams,
								name,
								displayUnit: unit,
								displayAmount: amount,
								preparation,
								status: existingIng ? 'found' : 'pending'
							})
						} else {
							// Unit not found - store with estimated grams, will be updated after AI lookup
							results.push({
								grams: amount * 100, // Placeholder, will need unit info
								name,
								displayUnit: unit,
								displayAmount: amount,
								preparation,
								status: 'pending'
							})
						}
					} else if (unit === 'g') {
						results.push({
							grams: amount,
							name,
							preparation,
							status: existingIng ? 'found' : 'pending'
						})
					} else {
						// No unit specified - check if ingredient has a default piece unit
						const defaultUnit =
							ingUnits.find(u => u.isDefault && u.name !== 'g') ?? ingUnits.find(u => u.name === 'pcs')
						if (defaultUnit) {
							results.push({
								grams: amount * defaultUnit.grams,
								name,
								displayUnit: defaultUnit.name,
								displayAmount: amount,
								preparation,
								status: 'found'
							})
						} else {
							// Assume grams
							results.push({
								grams: amount,
								name,
								preparation,
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
				const [, rawName, amountStr] = reverseMatch
				const amount = Number.parseFloat(amountStr)
				if (!Number.isNaN(amount)) {
					const { name, preparation } = extractPreparation(rawName.trim())
					const existingIng = ingredients.find(i => i.name.toLowerCase() === name.toLowerCase())
					results.push({
						grams: amount,
						name,
						preparation,
						status: existingIng ? 'found' : 'pending'
					})
				}
			}
		}
	}

	return results
}

export const IngredientSearchInput: FC<IngredientSearchInputProps> = ({ recipeId, onAddPending, onRemovePending }) => {
	const [search, setSearch] = useState('')
	const [debouncedSearch, setDebouncedSearch] = useState('')
	const [showDropdown, setShowDropdown] = useState(false)
	const [pastedIngredients, setPastedIngredients] = useState<ParsedIngredient[]>([])
	const [isProcessingPaste, setIsProcessingPaste] = useState(false)
	const [pasteError, setPasteError] = useState<Error | null>(null)
	const [creatingFdcId, setCreatingFdcId] = useState<number | null>(null)
	const [showBarcodeDialog, setShowBarcodeDialog] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const { isSignedIn } = useUser()
	const utils = trpc.useUtils()

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(search), 300)
		return () => clearTimeout(timer)
	}, [search])

	const settingsQuery = trpc.settings.get.useQuery(undefined, { enabled: isSignedIn })
	const ingredientsQuery = trpc.ingredient.list.useQuery()
	const recipesQuery = trpc.recipe.list.useQuery()
	const findOrCreate = trpc.ingredient.findOrCreate.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})
	const batchFindOrCreate = trpc.ingredient.batchFindOrCreate.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})
	const addIngredient = trpc.recipe.addIngredient.useMutation({
		onSuccess: () => {
			utils.recipe.get.invalidate({ id: recipeId })
		}
	})
	const usdaSearchQuery = trpc.ingredient.searchUSDA.useQuery(
		{ query: debouncedSearch },
		{ enabled: debouncedSearch.length >= 2 }
	)
	const createFromUSDA = trpc.ingredient.createFromUSDA.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})
	const addSubrecipe = trpc.recipe.addSubrecipe.useMutation({
		onSuccess: () => {
			utils.recipe.get.invalidate({ id: recipeId })
		}
	})
	const createIngredient = trpc.ingredient.create.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})

	const handleBarcodeProduct = useCallback(
		async (product: OFFProduct) => {
			setShowBarcodeDialog(false)
			const ingredient = await createIngredient.mutateAsync({
				name: product.name,
				protein: product.per100g.protein,
				carbs: product.per100g.carbs,
				fat: product.per100g.fat,
				kcal: product.per100g.kcal,
				fiber: product.per100g.fiber,
				source: 'manual'
			})
			addIngredient.mutate({
				recipeId,
				ingredientId: ingredient.id,
				amountGrams: product.servingSize,
				displayUnit: null,
				displayAmount: null,
				preparation: null
			})
		},
		[createIngredient, addIngredient, recipeId]
	)

	// Parse search input for amount/unit
	const parsedSearch = parseSingleIngredient(search)
	const searchName = parsedSearch?.name ?? search

	const searchResults = searchName.trim()
		? (ingredientsQuery.data ?? [])
				.flatMap(i => {
					const match = fuzzyMatch(searchName, i.name)
					return match ? [{ ingredient: i, match }] : []
				})
				.sort((a, b) => b.match.score - a.match.score)
				.slice(0, 10)
		: []

	// USDA results: filter out items that match local ingredients by fdcId
	const localFdcIds = new Set(searchResults.map(r => r.ingredient.fdcId).filter(Boolean))
	const usdaResults = (usdaSearchQuery.data ?? []).filter(r => !localFdcIds.has(r.fdcId))

	// Recipe search: filter out self, premade, and already-added subrecipes
	const recipeSearchResults = searchName.trim()
		? (recipesQuery.data ?? [])
				.filter(r => r.id !== recipeId && r.type === 'recipe')
				.flatMap(r => {
					const match = fuzzyMatch(searchName, r.name)
					return match ? [{ recipe: r, match }] : []
				})
				.sort((a, b) => b.match.score - a.match.score)
				.slice(0, 5)
		: []

	function handleSelectIngredient(
		ingredientId: Ingredient['id'],
		ingredientName: string,
		amountGrams = 100,
		displayUnit?: string,
		displayAmount?: number,
		preparation?: string | null
	) {
		onAddPending?.(ingredientName)
		addIngredient.mutate({
			recipeId,
			ingredientId,
			amountGrams,
			displayUnit: displayUnit ?? null,
			displayAmount: displayAmount ?? null,
			preparation: preparation ?? null
		})
		setSearch('')
		setShowDropdown(false)
	}

	async function handleSelectUSDA(fdcId: number, name: string) {
		setCreatingFdcId(fdcId)
		try {
			const { ingredient } = await createFromUSDA.mutateAsync({ fdcId, name })
			addIngredient.mutate({
				recipeId,
				ingredientId: ingredient.id,
				amountGrams: 100,
				displayUnit: null,
				displayAmount: null,
				preparation: null
			})
			setSearch('')
			setShowDropdown(false)
		} finally {
			setCreatingFdcId(null)
		}
	}

	async function handleFindOrCreate(
		name?: string,
		grams?: number,
		displayUnit?: string,
		displayAmount?: number,
		preparation?: string | null
	) {
		const ingredientName = name ?? search.trim()
		if (!ingredientName) return

		onAddPending?.(ingredientName)
		if (!name) {
			setSearch('')
			setShowDropdown(false)
		}

		try {
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
				displayAmount: finalDisplayAmount ?? null,
				preparation: preparation ?? null
			})

			return ingredient
		} catch {
			onRemovePending?.(ingredientName)
		}
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

	async function handleAddPastedIngredientsBatch(items: ParsedIngredient[]) {
		setIsProcessingPaste(true)
		setPasteError(null)
		const updated = [...items]

		try {
			const pendingItems = updated.filter(i => i.status !== 'added' && i.status !== 'error')
			const results = await batchFindOrCreate.mutateAsync({
				names: pendingItems.map(i => i.name)
			})

			let resultIdx = 0
			for (let i = 0; i < updated.length; i++) {
				if (updated[i].status === 'added' || updated[i].status === 'error') continue

				const item = updated[i]
				const { ingredient } = results[resultIdx++]

				// Recalculate grams using unit info from the created ingredient
				let finalGrams = item.grams
				if (item.displayUnit && item.displayAmount && ingredient.units) {
					const unitInfo = ingredient.units.find(
						(u: { name: string; grams: number }) => u.name.toLowerCase() === item.displayUnit!.toLowerCase()
					)
					if (unitInfo) {
						finalGrams = item.displayAmount * unitInfo.grams
					}
				}

				addIngredient.mutate({
					recipeId,
					ingredientId: ingredient.id,
					amountGrams: finalGrams,
					displayUnit: item.displayUnit ?? null,
					displayAmount: item.displayAmount ?? null,
					preparation: item.preparation ?? null
				})
				updated[i] = { ...item, status: 'added' }
				setPastedIngredients([...updated])
			}

			setPastedIngredients([])
			setIsProcessingPaste(false)
			utils.recipe.get.invalidate({ id: recipeId })
		} catch (err) {
			// Mark all pending items as error
			for (let i = 0; i < updated.length; i++) {
				if (updated[i].status !== 'added') {
					const errorMsg = err instanceof Error ? err.message : 'Unknown error'
					updated[i] = { ...updated[i], status: 'error', error: errorMsg }
				}
			}
			setPastedIngredients([...updated])
			setPasteError(err instanceof Error ? err : new Error(String(err)))
			setIsProcessingPaste(false)
		}
	}

	async function handleAddPastedIngredients(itemsToProcess?: ParsedIngredient[]) {
		const items = itemsToProcess ?? pastedIngredients

		// Use batch if setting is on
		if (settingsQuery.data?.batchLookups) {
			return handleAddPastedIngredientsBatch(items)
		}

		setIsProcessingPaste(true)
		setPasteError(null)
		const updated = [...items]

		for (let i = 0; i < updated.length; i++) {
			const item = updated[i]
			if (item.status === 'added' || item.status === 'error') continue

			try {
				// Backend handles DB lookup + AI fallback
				await handleFindOrCreate(item.name, item.grams, item.displayUnit, item.displayAmount, item.preparation)
				updated[i] = { ...item, status: 'added' }
				setPastedIngredients([...updated])
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error'
				updated[i] = { ...item, status: 'error', error: errorMsg }
				setPastedIngredients([...updated])
				setPasteError(err instanceof Error ? err : new Error(String(err)))
				setIsProcessingPaste(false)
				return // Stop processing on first error
			}
		}

		// All done successfully
		setPastedIngredients([])
		setIsProcessingPaste(false)
		utils.recipe.get.invalidate({ id: recipeId })
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
		const resetItems = pastedIngredients.map<ParsedIngredient>(item =>
			item.status === 'error' ? { ...item, status: 'pending', error: undefined } : item
		)
		setPastedIngredients(resetItems)
		handleAddPastedIngredients(resetItems)
	}

	// Show paste preview mode
	if (pastedIngredients.length > 0) {
		const hasErrors = pastedIngredients.some(i => i.status === 'error')
		const allAdded = pastedIngredients.every(i => i.status === 'added')

		return (
			<Card className="p-3">
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

				{pasteError && <TRPCError error={findOrCreate.error ?? batchFindOrCreate.error} className="mb-3" />}

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
			</Card>
		)
	}

	return (
		<div className="relative" ref={containerRef}>
			<div className="flex gap-2">
				<div className="relative flex-1">
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
						onBlur={e => {
							if (containerRef.current?.contains(e.relatedTarget as Node)) return
							setShowDropdown(false)
						}}
						onPaste={handlePaste}
						className="pl-8"
					/>
				</div>
				<Button variant="outline" onClick={() => setShowBarcodeDialog(true)}>
					<ScanLine className="size-4" />
					Scan
				</Button>
			</div>
			<BarcodeScanDialog
				open={showBarcodeDialog}
				onClose={() => setShowBarcodeDialog(false)}
				onProductFound={handleBarcodeProduct}
			/>
			{showDropdown && search.length > 0 && (
				<Card className="absolute top-full z-10 mt-1 w-full shadow-black/30 shadow-lg">
					{searchResults.map(({ ingredient, match }) => {
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
							const defaultUnit =
								ingredient.units?.find(u => u.isDefault) ??
								ingredient.units?.find(u => u.name === 'pcs')
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
									handleSelectIngredient(
										ingredient.id,
										ingredient.name,
										amountGrams,
										displayUnit,
										displayAmount,
										parsedSearch?.preparation
									)
								}
							>
								<div className="flex w-full items-center gap-2">
									<Plus className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
									<span className="text-ink text-sm">
										<FuzzyHighlight text={ingredient.name} positions={match.positions} />
									</span>
									<span className="ml-auto font-mono text-ink-faint text-xs">
										{ingredient.protein}p {ingredient.carbs}c {ingredient.fat}f
									</span>
								</div>
								<div className="ml-5.5">
									<MacroBar macros={ingredient} />
								</div>
							</button>
						)
					})}
					{searchResults.length === 0 &&
						recipeSearchResults.length === 0 &&
						usdaResults.length === 0 &&
						!findOrCreate.isPending &&
						!usdaSearchQuery.isLoading && (
							<div className="px-3 py-2 text-ink-faint text-sm">No ingredients or recipes found</div>
						)}
					{recipeSearchResults.length > 0 && (
						<>
							<div className="border-edge border-t px-3 py-1.5 font-medium text-ink-faint text-xs uppercase tracking-wider">
								Recipes
							</div>
							{recipeSearchResults.map(({ recipe, match }) => {
								const items = recipe.recipeIngredients
									.filter(ri => ri.ingredient != null)
									.map(ri => ({ per100g: ri.ingredient!, amountGrams: ri.amountGrams }))
								const totals = calculateRecipeTotals(items)
								const cookedWeight = getEffectiveCookedWeight(totals.weight, recipe.cookedWeight)
								const portionSize = getEffectivePortionSize(cookedWeight, recipe.portionSize)
								const portionCount = portionSize > 0 ? Math.round(cookedWeight / portionSize) : 1
								return (
									<button
										key={recipe.id}
										type="button"
										className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2"
										onMouseDown={() => {
											addSubrecipe.mutate({ recipeId, subrecipeId: recipe.id })
											setSearch('')
											setShowDropdown(false)
										}}
									>
										<div className="flex w-full items-center gap-2">
											<BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" />
											<span className="text-ink text-sm">
												<FuzzyHighlight text={recipe.name} positions={match.positions} />
											</span>
											<span className="ml-auto font-mono text-ink-faint text-xs">
												{portionCount} {portionCount === 1 ? 'portion' : 'portions'}
											</span>
										</div>
										<div className="ml-5.5">
											<MacroBar macros={totals} />
										</div>
									</button>
								)
							})}
						</>
					)}
					{addSubrecipe.isError && <TRPCError error={addSubrecipe.error} />}
					{usdaResults.length > 0 && (
						<>
							<div className="border-edge border-t px-3 py-1.5 font-medium text-ink-faint text-xs uppercase tracking-wider">
								USDA
							</div>
							{usdaResults.map(result => (
								<button
									key={result.fdcId}
									type="button"
									className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2"
									disabled={creatingFdcId === result.fdcId}
									onMouseDown={() => handleSelectUSDA(result.fdcId, result.description)}
								>
									<div className="flex w-full items-center gap-2">
										{creatingFdcId === result.fdcId ? (
											<Spinner className="h-3.5 w-3.5 shrink-0" />
										) : (
											<Database className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
										)}
										<span className="text-ink text-sm">{result.description}</span>
										<span className="ml-auto font-mono text-ink-faint text-xs">
											{Math.round(result.protein)}p {Math.round(result.carbs)}c{' '}
											{Math.round(result.fat)}f
										</span>
									</div>
									<div className="ml-5.5">
										<MacroBar macros={result} />
									</div>
								</button>
							))}
						</>
					)}
					{usdaSearchQuery.isLoading && debouncedSearch.length >= 2 && (
						<div className="flex items-center gap-2 border-edge border-t px-3 py-2 text-ink-faint text-sm">
							<Spinner className="size-4" />
							Searching USDA...
						</div>
					)}
					{createFromUSDA.isError && <TRPCError error={createFromUSDA.error} />}
					<button
						type="button"
						className="flex w-full items-center gap-2 border-edge border-t px-3 py-2.5 text-left text-accent text-sm hover:bg-surface-2"
						onMouseDown={() => {
							if (parsedSearch) {
								const { name, amount, unit, preparation } = parsedSearch
								// Pass unit info - grams will be recalculated after AI lookup
								handleFindOrCreate(
									name,
									unit === 'g' ? amount : amount * 100, // Placeholder grams if unit specified
									unit && unit !== 'g' ? unit : undefined,
									unit && unit !== 'g' ? amount : undefined,
									preparation
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
				</Card>
			)}
			{createIngredient.isError && <TRPCError error={createIngredient.error} />}
		</div>
	)
}
