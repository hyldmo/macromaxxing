import type { Recipe } from '@macromaxxing/db'
import { AlertTriangle, ArrowLeft, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { MarkdownEditor } from '~/components/ui/MarkdownEditor'
import { Spinner } from '~/components/ui/Spinner'
import { Switch } from '~/components/ui/Switch'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'
import { useUser } from '~/lib/user'
import { PortionPanel } from './components/PortionPanel'
import { RecipeIngredientTable } from './components/RecipeIngredientTable'
import { RecipeTotalsBar } from './components/RecipeTotalsBar'
import { useRecipeCalculations } from './hooks/useRecipeCalculations'

export function RecipeEditorPage() {
	const { id } = useParams<{ id: Recipe['id'] }>()
	const navigate = useNavigate()
	const isNew = !id
	const { user } = useUser()
	const userId = user?.id

	const recipeQuery = trpc.recipe.getPublic.useQuery({ id: id! }, { enabled: !!id })
	const isOwner = recipeQuery.data?.userId === userId

	const createMutation = trpc.recipe.create.useMutation({
		onSuccess: data => {
			if (data) navigate(`/recipes/${data.id}`, { replace: true })
		}
	})
	const updateMutation = trpc.recipe.update.useMutation({
		onSuccess: () => recipeQuery.refetch()
	})

	const [name, setName] = useState('')
	const [instructions, setInstructions] = useState('')
	const [hasLoadedRecipe, setHasLoadedRecipe] = useState(false)
	const [showPublishWarning, setShowPublishWarning] = useState(false)
	const handleReadonlyChange = () => undefined

	useEffect(() => {
		if (recipeQuery.data) {
			setName(recipeQuery.data.name)
			setInstructions(recipeQuery.data.instructions || '')
			setHasLoadedRecipe(true)
		}
	}, [recipeQuery.data])

	const calculations = useRecipeCalculations(recipeQuery.data)

	const ingredients = recipeQuery.data?.recipeIngredients.map(ri => ({
		name: ri.ingredient.name,
		grams: ri.amountGrams
	}))

	function handleCreate() {
		if (!name.trim()) return
		createMutation.mutate({ name: name.trim() })
	}

	function handleNameBlur() {
		if (id && isOwner && name.trim() && name.trim() !== recipeQuery.data?.name) {
			updateMutation.mutate({ id, name: name.trim() })
		}
	}

	useEffect(() => {
		if (!hasLoadedRecipe) return
		if (!id) return
		if (!isOwner) return
		const current = (recipeQuery.data?.instructions || '').trim()
		const next = instructions.trim()
		if (current === next) return

		const timeout = setTimeout(() => {
			updateMutation.mutate({ id, instructions: next === '' ? null : next })
		}, 800)

		return () => clearTimeout(timeout)
	}, [hasLoadedRecipe, id, instructions, isOwner, recipeQuery.data?.instructions, updateMutation])

	function handleCookedWeightChange(value: number | null) {
		if (id && isOwner) updateMutation.mutate({ id, cookedWeight: value })
	}

	function handlePortionSizeChange(value: number | null) {
		if (id && isOwner) updateMutation.mutate({ id, portionSize: value })
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
						<ArrowLeft className="size-4" />
					</Button>
				</Link>
				{isOwner || isNew ? (
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
				) : (
					<h1 className="font-semibold text-ink text-lg">{name}</h1>
				)}
				{isNew && (
					<Button onClick={handleCreate} disabled={!name.trim() || createMutation.isPending}>
						Create
					</Button>
				)}
				{isOwner && (
					<label
						htmlFor="public-toggle"
						className="ml-auto flex cursor-pointer items-center gap-2 text-ink-muted text-sm"
					>
						<span>Public</span>
						<Switch
							id="public-toggle"
							checked={!!recipeQuery.data?.isPublic}
							onChange={checked => {
								if (checked && recipeQuery.data?.sourceUrl) {
									setShowPublishWarning(true)
								} else {
									updateMutation.mutate({ id: id!, isPublic: checked })
								}
							}}
						/>
					</label>
				)}
				{!(isNew || isOwner) && (
					<span className="ml-auto flex items-center gap-1.5 text-ink-muted text-sm">
						<Eye className="size-4" />
						View only
					</span>
				)}
			</div>

			{recipeQuery.error && <TRPCError error={recipeQuery.error} />}
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
							effectivePortionSize={calculations.portionSize}
							effectiveCookedWeight={calculations.cookedWeight}
							onCookedWeightChange={isOwner ? handleCookedWeightChange : undefined}
							onPortionSizeChange={isOwner ? handlePortionSizeChange : undefined}
							ingredients={isOwner ? ingredients : undefined}
							instructions={isOwner ? instructions : undefined}
						/>
					</div>

					{/* Left column: ingredients */}
					<div className="min-w-0 space-y-3">
						<RecipeIngredientTable
							recipeId={id!}
							recipeIngredients={recipeQuery.data.recipeIngredients}
							ingredientMacros={calculations.ingredientMacros}
							readOnly={!isOwner}
						/>
						{recipeQuery.data.recipeIngredients.length > 0 && (
							<RecipeTotalsBar totals={calculations.totals} />
						)}

						<div className="space-y-1.5">
							<h3 className="px-1 font-semibold text-ink-muted text-xs uppercase tracking-wider">
								Method
							</h3>
							{isOwner ? (
								<MarkdownEditor
									value={instructions}
									onChange={setInstructions}
									placeholder="Add cooking instructions..."
								/>
							) : (
								<MarkdownEditor
									value={instructions || 'No instructions provided.'}
									onChange={handleReadonlyChange}
									readOnly
									className="min-h-[150px]"
								/>
							)}
						</div>
					</div>

					{/* Right column: PortionPanel (desktop only) */}
					<div className="hidden lg:block">
						<div className="sticky top-4">
							<PortionPanel
								portion={calculations.portion}
								cookedWeight={recipeQuery.data.cookedWeight}
								rawTotal={calculations.totals.weight}
								portionSize={recipeQuery.data.portionSize}
								effectivePortionSize={calculations.portionSize}
								effectiveCookedWeight={calculations.cookedWeight}
								onCookedWeightChange={isOwner ? handleCookedWeightChange : undefined}
								onPortionSizeChange={isOwner ? handlePortionSizeChange : undefined}
								ingredients={isOwner ? ingredients : undefined}
								instructions={isOwner ? instructions : undefined}
							/>
						</div>
					</div>
				</div>
			)}

			{showPublishWarning &&
				createPortal(
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
						<div className="w-full max-w-sm rounded-[--radius-md] border border-edge bg-surface-0 p-4">
							<div className="mb-3 flex items-center gap-2">
								<AlertTriangle className="size-5 text-warning" />
								<h3 className="font-semibold text-ink">Publish imported recipe?</h3>
							</div>
							<p className="mb-4 text-ink-muted text-sm">
								This recipe was imported from an external source. Make sure you have permission to share
								it publicly.
							</p>
							<div className="flex justify-end gap-2">
								<Button variant="ghost" onClick={() => setShowPublishWarning(false)}>
									Cancel
								</Button>
								<Button
									onClick={() => {
										updateMutation.mutate({ id: id!, isPublic: true })
										setShowPublishWarning(false)
									}}
								>
									Publish anyway
								</Button>
							</div>
						</div>
					</div>,
					document.body
				)}
		</div>
	)
}
