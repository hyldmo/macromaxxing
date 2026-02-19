import type { Recipe } from '@macromaxxing/db'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Spinner, TRPCError } from '~/components/ui'
import { getImageAttribution, getImageUrl, isExternalImage } from '~/lib/images'
import { trpc } from '~/lib/trpc'
import { useDocumentTitle } from '~/lib/useDocumentTitle'
import { BatchMultiplierPills } from './components/BatchMultiplierPills'
import { CookIngredientList } from './components/CookIngredientList'
import { CookInstructionSteps } from './components/CookInstructionSteps'
import { CookPortionSummary } from './components/CookPortionSummary'
import { useRecipeCalculations } from './hooks/useRecipeCalculations'
import { getEffectiveCookedWeight, getEffectivePortionSize } from './utils/macros'

export function CookModePage() {
	const { id } = useParams<{ id: Recipe['id'] }>()
	const recipeQuery = trpc.recipe.get.useQuery({ id: id! }, { enabled: !!id })
	const [batchSize, setBatchSize] = useState(1)

	const recipe = recipeQuery.data
	const calculations = useRecipeCalculations(recipe)

	useDocumentTitle(recipe ? `Cook: ${recipe.name}` : 'Cook Mode')

	if (recipeQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	if (recipeQuery.error) {
		return <TRPCError error={recipeQuery.error} />
	}

	if (!(recipe && calculations)) return null

	const cookedWeight = getEffectiveCookedWeight(calculations.totals.weight, recipe.cookedWeight)
	const portionSize = getEffectivePortionSize(cookedWeight, recipe.portionSize)
	const totalPortions = Math.round((cookedWeight / portionSize) * batchSize * 10) / 10

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Link to={`/recipes/${id}`}>
					<Button variant="ghost" size="icon">
						<ArrowLeft className="size-4" />
					</Button>
				</Link>
				<h1 className="font-semibold text-ink text-lg">{recipe.name}</h1>
			</div>

			{/* Recipe image */}
			{recipe.image && (
				<div className="relative">
					<img
						src={getImageUrl(recipe.image)}
						alt={recipe.name}
						className="h-48 w-full border border-edge bg-surface-0 object-cover"
					/>
					{isExternalImage(recipe.image) && (
						<span className="absolute right-2 bottom-2 bg-surface-0/80 px-2 py-0.5 text-ink-faint text-xs">
							from {getImageAttribution(recipe.image)}
						</span>
					)}
				</div>
			)}

			{/* Batch multiplier + portion count */}
			<div className="space-y-2">
				<BatchMultiplierPills value={batchSize} onChange={setBatchSize} />
				<p className="text-ink-muted text-sm">
					Makes{' '}
					<span className="font-mono font-semibold text-ink tabular-nums">
						{totalPortions % 1 === 0 ? totalPortions : totalPortions.toFixed(1)}
					</span>{' '}
					{totalPortions === 1 ? 'portion' : 'portions'}
				</p>
			</div>

			{/* Ingredients checklist */}
			{recipe.recipeIngredients.length > 0 && (
				<CookIngredientList ingredients={recipe.recipeIngredients} batchSize={batchSize} />
			)}

			{/* Method steps */}
			{recipe.instructions?.trim() && <CookInstructionSteps markdown={recipe.instructions} />}

			{/* Per-portion macro summary */}
			<CookPortionSummary portion={calculations.portion} />
		</div>
	)
}
