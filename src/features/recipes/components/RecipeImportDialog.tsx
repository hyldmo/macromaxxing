import type { ImageSource } from '@macromaxxing/db'
import { ArrowLeft, FileText, Globe, X } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Modal, Spinner, Textarea, TRPCError } from '~/components/ui'
import { cn, useUser } from '~/lib'
import { trpc } from '~/lib/trpc'
import { formatIngredientAmount, getAllUnits } from '../utils/format'

export interface RecipeImportDialogProps {
	open: boolean
	onClose: () => void
}

type Mode = 'url' | 'text'
type Step = 'input' | 'preview' | 'importing'

interface ParsedIngredient {
	name: string
	amount: number
	unit: string
	preparation?: string | null
}

export const RecipeImportDialog: FC<RecipeImportDialogProps> = ({ open, onClose }) => {
	const [mode, setMode] = useState<Mode>('url')
	const [url, setUrl] = useState('')
	const [text, setText] = useState('')
	const [step, setStep] = useState<Step>('input')

	// Preview state
	const [recipeName, setRecipeName] = useState('')
	const [ingredients, setIngredients] = useState<ParsedIngredient[]>([])
	const [instructions, setInstructions] = useState('')
	const [servings, setServings] = useState<number | null>(null)
	const [source, setSource] = useState<'structured' | 'ai'>('ai')
	const [imageUrl, setImageUrl] = useState<ImageSource | null>(null)

	// Import progress
	const [progress, setProgress] = useState({ current: 0, total: 0 })
	const [importError, setImportError] = useState<string | null>(null)

	const navigate = useNavigate()
	const { isSignedIn } = useUser()
	const utils = trpc.useUtils()

	const settingsQuery = trpc.settings.get.useQuery(undefined, { enabled: isSignedIn })
	const parseRecipe = trpc.ai.parseRecipe.useMutation()
	const createRecipe = trpc.recipe.create.useMutation()
	const updateRecipe = trpc.recipe.update.useMutation()
	const findOrCreate = trpc.ingredient.findOrCreate.useMutation()
	const batchFindOrCreate = trpc.ingredient.batchFindOrCreate.useMutation()
	const addIngredient = trpc.recipe.addIngredient.useMutation()

	// Reset state when dialog closes
	const parseRecipeReset = parseRecipe.reset
	useEffect(() => {
		if (!open) {
			setMode('url')
			setUrl('')
			setText('')
			setStep('input')
			setRecipeName('')
			setIngredients([])
			setInstructions('')
			setServings(null)
			setSource('ai')
			setImageUrl(null)
			setProgress({ current: 0, total: 0 })
			setImportError(null)
			parseRecipeReset()
		}
	}, [open, parseRecipeReset])

	// Close on Escape
	useEffect(() => {
		if (!open) return
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && step !== 'importing') onClose()
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [open, step, onClose])

	async function handleParse() {
		const result = await parseRecipe.mutateAsync({
			url: mode === 'url' ? url.trim() : undefined,
			text: mode === 'text' ? text.trim() : undefined
		})
		setRecipeName(result.name)
		setIngredients(result.ingredients)
		setInstructions(result.instructions)
		setServings(result.servings)
		setSource(result.source)
		setImageUrl(result.imageUrl ?? null)
		setStep('preview')
	}

	function resolveGrams(
		ing: ParsedIngredient,
		ingredientData: { units?: Array<{ name: string; grams: number }> | null; density?: number | null }
	) {
		let amountGrams: number
		let displayUnit: string | null = null
		let displayAmount: number | null = null

		if (ing.unit === 'g') {
			amountGrams = ing.amount
		} else {
			const allUnits = getAllUnits(ingredientData.units ?? [], ingredientData.density ?? null)
			const unitInfo = allUnits.find(
				(u: { name: string; grams: number }) => u.name.toLowerCase() === ing.unit.toLowerCase()
			)
			if (unitInfo) {
				amountGrams = ing.amount * unitInfo.grams
				displayUnit = ing.unit
				displayAmount = ing.amount
			} else {
				amountGrams = ing.amount
			}
		}

		return { amountGrams, displayUnit, displayAmount }
	}

	async function handleImport() {
		setStep('importing')
		setImportError(null)
		setProgress({ current: 0, total: ingredients.length })

		try {
			// 1. Create recipe
			const recipe = await createRecipe.mutateAsync({
				name: recipeName,
				instructions: instructions || undefined,
				sourceUrl: mode === 'url' ? url.trim() : null
			})

			const useBatch = settingsQuery.data?.batchLookups

			if (useBatch) {
				// Batch: single call for all ingredients
				setProgress({ current: 0, total: ingredients.length })
				const results = await batchFindOrCreate.mutateAsync({
					names: ingredients.map(ing => ing.name)
				})

				for (let i = 0; i < ingredients.length; i++) {
					const ing = ingredients[i]
					const { ingredient } = results[i]
					setProgress({ current: i + 1, total: ingredients.length })

					const { amountGrams, displayUnit, displayAmount } = resolveGrams(ing, ingredient)

					await addIngredient.mutateAsync({
						recipeId: recipe.id,
						ingredientId: ingredient.id,
						amountGrams,
						displayUnit,
						displayAmount,
						preparation: ing.preparation ?? null
					})
				}
			} else {
				// Sequential: one call per ingredient (current behavior)
				for (let i = 0; i < ingredients.length; i++) {
					const ing = ingredients[i]
					setProgress({ current: i + 1, total: ingredients.length })

					const { ingredient } = await findOrCreate.mutateAsync({ name: ing.name })
					const { amountGrams, displayUnit, displayAmount } = resolveGrams(ing, ingredient)

					await addIngredient.mutateAsync({
						recipeId: recipe.id,
						ingredientId: ingredient.id,
						amountGrams,
						displayUnit,
						displayAmount,
						preparation: ing.preparation ?? null
					})
				}
			}

			// 3. Set image if available
			if (imageUrl) {
				await updateRecipe.mutateAsync({ id: recipe.id, image: imageUrl })
			}

			// 4. Navigate to the new recipe
			utils.recipe.list.invalidate()
			navigate(`/recipes/${recipe.id}`)
			onClose()
		} catch (err) {
			setImportError(err instanceof Error ? err.message : 'Import failed')
			setStep('preview')
		}
	}

	if (!open) return null

	const canParse = mode === 'url' ? url.trim().length > 0 : text.trim().length > 0

	return (
		<Modal className="flex max-h-[80vh] w-full max-w-lg flex-col">
			{/* Header */}
			<div className="flex items-center gap-3 border-edge border-b px-4 py-3">
				{step === 'preview' && (
					<Button variant="ghost" size="icon" onClick={() => setStep('input')}>
						<ArrowLeft className="size-4" />
					</Button>
				)}
				<h2 className="font-semibold text-ink">Import Recipe</h2>
				{step === 'preview' && (
					<span
						className={cn(
							'rounded-full px-2 py-0.5 text-xs',
							source === 'structured' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-accent/10 text-accent'
						)}
					>
						{source === 'structured' ? 'JSON-LD' : 'AI'}
					</span>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="ml-auto"
					onClick={onClose}
					disabled={step === 'importing'}
				>
					<X className="size-4" />
				</Button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4">
				{step === 'input' && (
					<div className="space-y-3">
						{/* Mode toggle */}
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => setMode('url')}
								className={cn(
									'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
									mode === 'url'
										? 'bg-accent text-white'
										: 'bg-surface-2 text-ink-muted hover:text-ink'
								)}
							>
								<Globe className="size-3.5" />
								URL
							</button>
							<button
								type="button"
								onClick={() => setMode('text')}
								className={cn(
									'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
									mode === 'text'
										? 'bg-accent text-white'
										: 'bg-surface-2 text-ink-muted hover:text-ink'
								)}
							>
								<FileText className="size-3.5" />
								Text
							</button>
						</div>

						{mode === 'url' ? (
							<Input
								placeholder="https://example.com/recipe..."
								value={url}
								onChange={e => setUrl(e.target.value)}
								onKeyDown={e => {
									if (e.key === 'Enter' && canParse && !parseRecipe.isPending) handleParse()
								}}
								autoFocus
							/>
						) : (
							<Textarea
								placeholder="Paste recipe text here..."
								value={text}
								onChange={e => setText(e.target.value)}
								rows={8}
								autoFocus
							/>
						)}

						{parseRecipe.error && <TRPCError error={parseRecipe.error} />}
					</div>
				)}

				{step === 'preview' && (
					<div className="space-y-3">
						{importError && (
							<div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
								{importError}
							</div>
						)}

						<div className="space-y-1">
							<span className="text-ink-muted text-xs">Name</span>
							<Input value={recipeName} onChange={e => setRecipeName(e.target.value)} />
						</div>

						<div className="space-y-1">
							<span className="text-ink-muted text-xs">Ingredients ({ingredients.length})</span>
							<div className="max-h-48 overflow-y-auto rounded-sm border border-edge bg-surface-1 p-2">
								{ingredients.map(ing => (
									<div
										key={`${ing.name}-${ing.amount}-${ing.unit}`}
										className="flex items-center gap-2 py-0.5 text-sm"
									>
										<span className="w-20 text-right font-mono text-ink-muted tabular-nums">
											{formatIngredientAmount(ing.amount, ing.unit)}
										</span>
										<span className="text-ink">{ing.name}</span>
										{ing.preparation && (
											<span className="text-ink-faint text-xs">{ing.preparation}</span>
										)}
									</div>
								))}
								{ingredients.length === 0 && (
									<p className="py-2 text-center text-ink-faint text-sm">No ingredients parsed</p>
								)}
							</div>
						</div>

						{instructions && (
							<div className="space-y-1">
								<span className="text-ink-muted text-xs">Instructions</span>
								<div className="max-h-24 overflow-y-auto whitespace-pre-line rounded-sm border border-edge bg-surface-1 p-2 text-ink-muted text-sm">
									{instructions}
								</div>
							</div>
						)}

						{servings && (
							<div className="text-ink-muted text-sm">
								Servings: <span className="font-mono tabular-nums">{servings}</span>
							</div>
						)}

						{imageUrl && (
							<div className="space-y-1">
								<span className="text-ink-muted text-xs">Image</span>
								<img
									src={imageUrl}
									alt=""
									className="h-32 w-full border border-edge bg-surface-0 object-cover"
								/>
							</div>
						)}
					</div>
				)}

				{step === 'importing' && (
					<div className="flex flex-col items-center gap-3 py-8">
						<Spinner />
						<p className="text-ink-muted text-sm">
							{settingsQuery.data?.batchLookups
								? `Looking up ingredients... (${progress.current}/${progress.total})`
								: `Adding ingredients... (${progress.current}/${progress.total})`}
						</p>
					</div>
				)}
			</div>

			{/* Footer */}
			{step !== 'importing' && (
				<div className="flex justify-end gap-2 border-edge border-t px-4 py-3">
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					{step === 'input' && (
						<Button onClick={handleParse} disabled={!canParse || parseRecipe.isPending}>
							{parseRecipe.isPending ? (
								<>
									<Spinner className="size-4 text-current" />
									Parsing...
								</>
							) : (
								'Parse'
							)}
						</Button>
					)}
					{step === 'preview' && (
						<Button onClick={handleImport} disabled={!recipeName.trim()}>
							Import Recipe
						</Button>
					)}
				</div>
			)}
		</Modal>
	)
}
