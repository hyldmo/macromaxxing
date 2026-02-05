import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'
import { PortionPanel } from './components/PortionPanel'
import { RecipeIngredientTable } from './components/RecipeIngredientTable'
import { RecipeTotalsBar } from './components/RecipeTotalsBar'
import { useRecipeCalculations } from './hooks/useRecipeCalculations'

export function RecipeEditorPage() {
	const { id } = useParams()
	const navigate = useNavigate()
	const utils = trpc.useUtils()
	const isNew = !id

	const recipeQuery = trpc.recipe.get.useQuery({ id: id! }, { enabled: !!id })
	const createMutation = trpc.recipe.create.useMutation({
		onSuccess: data => {
			if (data) navigate(`/recipes/${data.id}`, { replace: true })
		}
	})
	const updateMutation = trpc.recipe.update.useMutation({
		onSuccess: () => utils.recipe.get.invalidate({ id: id! })
	})

	const [name, setName] = useState('')

	useEffect(() => {
		if (recipeQuery.data) {
			setName(recipeQuery.data.name)
		}
	}, [recipeQuery.data])

	const calculations = useRecipeCalculations(recipeQuery.data)

	function handleCreate() {
		if (!name.trim()) return
		createMutation.mutate({ name: name.trim() })
	}

	function handleNameBlur() {
		if (id && name.trim() && name.trim() !== recipeQuery.data?.name) {
			updateMutation.mutate({ id, name: name.trim() })
		}
	}

	function handleCookedWeightChange(value: number | null) {
		if (id) updateMutation.mutate({ id, cookedWeight: value })
	}

	function handlePortionSizeChange(value: number) {
		if (id) updateMutation.mutate({ id, portionSize: value })
	}

	if (!isNew && recipeQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<Link to="/recipes">
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<Input
					placeholder="Recipe name"
					value={name}
					onChange={e => setName(e.target.value)}
					onBlur={handleNameBlur}
					onKeyDown={e => {
						if (e.key === 'Enter' && isNew) handleCreate()
					}}
					className="border-none bg-transparent p-0 font-semibold text-ink text-lg placeholder:text-ink-faint focus-visible:ring-0"
				/>
				{isNew && (
					<Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
						Create
					</Button>
				)}
			</div>

			{(createMutation.error || updateMutation.error) && (
				<TRPCError error={createMutation.error || updateMutation.error} />
			)}

			{!isNew && recipeQuery.data && calculations && (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
					{/* Mobile: PortionPanel at top */}
					<div className="order-first lg:hidden">
						<PortionPanel
							portion={calculations.portion}
							cookedWeight={recipeQuery.data.cookedWeight}
							rawTotal={calculations.totals.weight}
							portionSize={recipeQuery.data.portionSize}
							effectiveCookedWeight={calculations.cookedWeight}
							onCookedWeightChange={handleCookedWeightChange}
							onPortionSizeChange={handlePortionSizeChange}
						/>
					</div>

					{/* Left column: ingredients */}
					<div className="min-w-0 space-y-3">
						<RecipeIngredientTable
							recipeId={id!}
							recipeIngredients={recipeQuery.data.recipeIngredients}
							ingredientMacros={calculations.ingredientMacros}
						/>
						{recipeQuery.data.recipeIngredients.length > 0 && (
							<RecipeTotalsBar totals={calculations.totals} />
						)}
					</div>

					{/* Right column: PortionPanel (desktop only) */}
					<div className="hidden lg:block">
						<div className="sticky top-4">
							<PortionPanel
								portion={calculations.portion}
								cookedWeight={recipeQuery.data.cookedWeight}
								rawTotal={calculations.totals.weight}
								portionSize={recipeQuery.data.portionSize}
								effectiveCookedWeight={calculations.cookedWeight}
								onCookedWeightChange={handleCookedWeightChange}
								onPortionSizeChange={handlePortionSizeChange}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
