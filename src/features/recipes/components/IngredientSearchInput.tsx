import { ClipboardPaste, Plus, Search, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
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
	status: 'pending' | 'found' | 'added' | 'error'
	error?: string
}

function parseIngredientList(text: string): ParsedIngredient[] {
	const lines = text.split('\n').filter(line => line.trim())
	const results: ParsedIngredient[] = []

	for (const line of lines) {
		// Match patterns like "500g Pasta", "500g    Pasta", "500 g Pasta", "Pasta 500g"
		const match = line.match(/^(\d+)\s*g?\s+(.+)$/) || line.match(/^(.+?)\s+(\d+)\s*g?$/)
		if (match) {
			const [, first, second] = match
			// Determine which is the number
			const num = Number.parseInt(first, 10)
			if (!Number.isNaN(num)) {
				results.push({ grams: num, name: second.trim(), status: 'pending' })
			} else {
				const num2 = Number.parseInt(second, 10)
				if (!Number.isNaN(num2)) {
					results.push({ grams: num2, name: first.trim(), status: 'pending' })
				}
			}
		}
	}

	return results
}

export function IngredientSearchInput({ recipeId }: IngredientSearchInputProps) {
	const [search, setSearch] = useState('')
	const [showDropdown, setShowDropdown] = useState(false)
	const [pastedIngredients, setPastedIngredients] = useState<ParsedIngredient[]>([])
	const [isProcessingPaste, setIsProcessingPaste] = useState(false)
	const [pasteError, setPasteError] = useState<Error | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const utils = trpc.useUtils()

	const ingredientsQuery = trpc.ingredient.list.useQuery()
	const aiLookup = trpc.ai.lookup.useMutation()
	const createIngredient = trpc.ingredient.create.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})
	const addIngredient = trpc.recipe.addIngredient.useMutation({
		onSuccess: () => {
			utils.recipe.get.invalidate({ id: recipeId })
		}
	})

	const filtered =
		ingredientsQuery.data?.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10) ?? []

	function handleSelectIngredient(ingredientId: string, amountGrams = 100) {
		addIngredient.mutate({ recipeId, ingredientId, amountGrams })
		setSearch('')
		setShowDropdown(false)
	}

	async function handleAiLookup(name?: string, grams?: number) {
		const ingredientName = name ?? search.trim()
		if (!ingredientName) return
		const macros = await aiLookup.mutateAsync({ ingredientName })
		const ingredient = await createIngredient.mutateAsync({
			name: ingredientName,
			...macros,
			source: 'ai'
		})
		if (ingredient) {
			addIngredient.mutate({ recipeId, ingredientId: ingredient.id, amountGrams: grams ?? 100 })
		}
		if (!name) {
			setSearch('')
			setShowDropdown(false)
		}
		return ingredient
	}

	function handlePaste(e: React.ClipboardEvent) {
		const text = e.clipboardData.getData('text')
		const parsed = parseIngredientList(text)
		if (parsed.length > 1) {
			e.preventDefault()
			// Mark existing ingredients as found
			const ingredients = ingredientsQuery.data ?? []
			const withStatus = parsed.map(item => {
				const existing = ingredients.find(i => i.name.toLowerCase() === item.name.toLowerCase())
				return { ...item, status: existing ? 'found' : 'pending' } as ParsedIngredient
			})
			setPastedIngredients(withStatus)
			setPasteError(null)
			setShowDropdown(false)
		}
	}

	async function handleAddPastedIngredients() {
		setIsProcessingPaste(true)
		setPasteError(null)
		const ingredients = ingredientsQuery.data ?? []
		const updated = [...pastedIngredients]

		for (let i = 0; i < updated.length; i++) {
			const item = updated[i]
			if (item.status === 'added' || item.status === 'error') continue

			try {
				// Try to find existing ingredient (case-insensitive)
				const existing = ingredients.find(ing => ing.name.toLowerCase() === item.name.toLowerCase())
				if (existing) {
					addIngredient.mutate({ recipeId, ingredientId: existing.id, amountGrams: item.grams })
					updated[i] = { ...item, status: 'added' }
				} else {
					// Look up with AI
					await handleAiLookup(item.name, item.grams)
					updated[i] = { ...item, status: 'added' }
				}
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
		utils.recipe.get.invalidate({ id: recipeId })
	}

	function cancelPaste() {
		setPastedIngredients([])
		setPasteError(null)
		aiLookup.reset()
	}

	function retryPaste() {
		setPasteError(null)
		aiLookup.reset()
		handleAddPastedIngredients()
	}

	// Show paste preview mode
	if (pastedIngredients.length > 0) {
		const hasErrors = pastedIngredients.some(i => i.status === 'error')
		const allAdded = pastedIngredients.every(i => i.status === 'added')

		return (
			<div className="rounded-[--radius-md] border border-edge bg-surface-1 p-3">
				<div className="mb-2 flex items-center gap-2 text-ink-muted text-sm">
					<ClipboardPaste className="h-4 w-4" />
					<span>
						{isProcessingPaste
							? `Adding ingredients... (${pastedIngredients.filter(i => i.status === 'added').length}/${pastedIngredients.length})`
							: `Parsed ${pastedIngredients.length} ingredients from paste`}
					</span>
				</div>
				<div className="mb-3 space-y-1">
					{pastedIngredients.map(item => (
						<div key={`${item.grams}-${item.name}`} className="flex items-center gap-2 text-sm">
							<span className="w-16 text-right font-mono text-ink-muted">{item.grams}g</span>
							<span className={item.status === 'error' ? 'text-destructive' : 'text-ink'}>
								{item.name}
							</span>
							{item.status === 'found' && <span className="text-success text-xs">✓ found</span>}
							{item.status === 'pending' && <span className="text-accent text-xs">+ AI lookup</span>}
							{item.status === 'added' && <span className="text-success text-xs">✓ added</span>}
							{item.status === 'error' && <span className="text-destructive text-xs">✗ failed</span>}
						</div>
					))}
				</div>

				{pasteError && <TRPCError error={aiLookup.error} className="mb-3" />}

				<div className="flex gap-2">
					{hasErrors ? (
						<>
							<Button onClick={retryPaste} disabled={isProcessingPaste}>
								<Sparkles className="h-4 w-4" />
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
							<Button onClick={handleAddPastedIngredients} disabled={isProcessingPaste}>
								{isProcessingPaste ? (
									<>
										<Spinner className="h-4 w-4" />
										Adding...
									</>
								) : (
									<>
										<Plus className="h-4 w-4" />
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
				<Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-faint" />
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
					{filtered.map(ingredient => (
						<button
							key={ingredient.id}
							type="button"
							className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2"
							onMouseDown={() => handleSelectIngredient(ingredient.id)}
						>
							<div className="flex w-full items-center gap-2">
								<Plus className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
								<span className="text-ink text-sm">{ingredient.name}</span>
								<span className="ml-auto font-mono text-ink-faint text-xs">
									{ingredient.protein}p {ingredient.carbs}c {ingredient.fat}f
								</span>
							</div>
							<div className="ml-5.5">
								<MacroBar protein={ingredient.protein} carbs={ingredient.carbs} fat={ingredient.fat} />
							</div>
						</button>
					))}
					{filtered.length === 0 && !aiLookup.isPending && (
						<div className="px-3 py-2 text-ink-faint text-sm">No ingredients found</div>
					)}
					<button
						type="button"
						className="flex w-full items-center gap-2 border-edge border-t px-3 py-2.5 text-left text-accent text-sm hover:bg-surface-2"
						onMouseDown={() => handleAiLookup()}
						disabled={aiLookup.isPending}
					>
						{aiLookup.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
						Look up "{search}" with AI
					</button>
					{aiLookup.isError && <TRPCError error={aiLookup.error} />}
				</div>
			)}
		</div>
	)
}
