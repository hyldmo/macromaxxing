import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Card, CardContent, CardHeader } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { trpc } from '~/lib/trpc'
import { CookedWeightInput } from './components/CookedWeightInput'
import { PortionSizeInput } from './components/PortionSizeInput'
import { RecipeIngredientTable } from './components/RecipeIngredientTable'
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
			<div className="flex items-center gap-2">
				<Link to="/recipes">
					<Button variant="ghost" size="icon">
						<ArrowLeft className="h-4 w-4" />
					</Button>
				</Link>
				<h1 className="font-semibold text-ink">{isNew ? 'New Recipe' : 'Edit Recipe'}</h1>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<Input
							placeholder="Recipe name"
							value={name}
							onChange={e => setName(e.target.value)}
							onBlur={handleNameBlur}
							onKeyDown={e => {
								if (e.key === 'Enter' && isNew) handleCreate()
							}}
							className="font-medium"
						/>
						{isNew && (
							<Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
								Create
							</Button>
						)}
					</div>
				</CardHeader>

				{!isNew && recipeQuery.data && calculations && (
					<CardContent className="space-y-3">
						<RecipeIngredientTable
							recipeId={id!}
							recipeIngredients={recipeQuery.data.recipeIngredients}
							ingredientMacros={calculations.ingredientMacros}
							totals={calculations.totals}
							portion={calculations.portion}
						/>
						<div className="flex flex-wrap gap-6">
							<CookedWeightInput
								cookedWeight={recipeQuery.data.cookedWeight}
								rawTotal={calculations.totals.weight}
								onChange={handleCookedWeightChange}
							/>
							<PortionSizeInput
								portionSize={recipeQuery.data.portionSize}
								onChange={handlePortionSizeChange}
							/>
						</div>
					</CardContent>
				)}
			</Card>
		</div>
	)
}
