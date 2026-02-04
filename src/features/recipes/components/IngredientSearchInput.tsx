import { Plus, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { trpc } from '~/lib/trpc'

interface IngredientSearchInputProps {
	recipeId: string
}

export function IngredientSearchInput({ recipeId }: IngredientSearchInputProps) {
	const [search, setSearch] = useState('')
	const [showDropdown, setShowDropdown] = useState(false)
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
			setSearch('')
			setShowDropdown(false)
		}
	})

	const filtered =
		ingredientsQuery.data?.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 10) ?? []

	function handleSelectIngredient(ingredientId: string) {
		addIngredient.mutate({ recipeId, ingredientId, amountGrams: 100 })
	}

	async function handleAiLookup() {
		if (!search.trim()) return
		const macros = await aiLookup.mutateAsync({ ingredientName: search.trim() })
		const ingredient = await createIngredient.mutateAsync({
			name: search.trim(),
			...macros,
			source: 'ai'
		})
		if (ingredient) {
			addIngredient.mutate({ recipeId, ingredientId: ingredient.id, amountGrams: 100 })
		}
	}

	return (
		<div className="relative">
			<Input
				ref={inputRef}
				placeholder="Search or add ingredient..."
				value={search}
				onChange={e => {
					setSearch(e.target.value)
					setShowDropdown(true)
				}}
				onFocus={() => setShowDropdown(true)}
				onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
			/>
			{showDropdown && search.length > 0 && (
				<div className="absolute top-full z-10 mt-1 w-full rounded-[--radius-md] border border-edge bg-surface-1 shadow-black/30 shadow-lg">
					{filtered.map(ingredient => (
						<button
							key={ingredient.id}
							type="button"
							className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink text-sm hover:bg-surface-2"
							onMouseDown={() => handleSelectIngredient(ingredient.id)}
						>
							<Plus className="h-3.5 w-3.5 text-ink-faint" />
							{ingredient.name}
							<span className="ml-auto font-mono text-ink-faint text-xs">
								{ingredient.protein}p {ingredient.carbs}c {ingredient.fat}f
							</span>
						</button>
					))}
					{filtered.length === 0 && !aiLookup.isPending && (
						<div className="px-3 py-2 text-ink-faint text-sm">No ingredients found</div>
					)}
					<button
						type="button"
						className="flex w-full items-center gap-2 border-edge border-t px-3 py-2 text-left text-accent text-sm hover:bg-surface-2"
						onMouseDown={handleAiLookup}
						disabled={aiLookup.isPending}
					>
						{aiLookup.isPending ? (
							<Spinner className="h-3.5 w-3.5" />
						) : (
							<Sparkles className="h-3.5 w-3.5" />
						)}
						Look up "{search}" with AI
					</button>
					{aiLookup.isError && (
						<div className="px-3 py-2 text-destructive text-xs">{aiLookup.error.message}</div>
					)}
				</div>
			)}
		</div>
	)
}
