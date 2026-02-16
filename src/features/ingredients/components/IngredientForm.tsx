import { Check, Plus, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, Input, NumberInput, TRPCError } from '~/components/ui'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { MacroInput } from './MacroInput'

export interface IngredientFormProps {
	onClose: () => void
	editIngredient?: RouterOutput['ingredient']['list'][number]
}

interface NewUnit {
	name: string
	grams: string
}

export const IngredientForm: FC<IngredientFormProps> = ({ onClose, editIngredient }) => {
	const [name, setName] = useState(editIngredient?.name ?? '')
	const [protein, setProtein] = useState(editIngredient?.protein.toString() ?? '')
	const [carbs, setCarbs] = useState(editIngredient?.carbs.toString() ?? '')
	const [fat, setFat] = useState(editIngredient?.fat.toString() ?? '')
	const [kcal, setKcal] = useState(editIngredient?.kcal.toString() ?? '')
	const [fiber, setFiber] = useState(editIngredient?.fiber.toString() ?? '')
	const [density, setDensity] = useState(editIngredient?.density?.toString() ?? '')
	const [newUnit, setNewUnit] = useState<NewUnit>({ name: '', grams: '' })
	const [isEnriching, setIsEnriching] = useState(false)
	const utils = trpc.useUtils()

	const units = editIngredient?.units ?? []

	const createMutation = trpc.ingredient.create.useMutation({
		onSuccess: () => {
			utils.ingredient.list.invalidate()
			onClose()
		}
	})

	const updateMutation = trpc.ingredient.update.useMutation({
		onSuccess: () => {
			utils.ingredient.list.invalidate()
		}
	})

	const createUnitMutation = trpc.ingredient.createUnit.useMutation({
		onSuccess: () => {
			utils.ingredient.list.invalidate()
			setNewUnit({ name: '', grams: '' })
		}
	})

	const updateUnitMutation = trpc.ingredient.updateUnit.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})

	const deleteUnitMutation = trpc.ingredient.deleteUnit.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})

	const lookupMutation = trpc.ai.lookup.useMutation()

	async function handleRelookup() {
		if (!name.trim()) return
		const result = await lookupMutation.mutateAsync({ ingredientName: name.trim() })
		setProtein(result.protein.toString())
		setCarbs(result.carbs.toString())
		setFat(result.fat.toString())
		setKcal(result.kcal.toString())
		setFiber(result.fiber.toString())
		if (result.density !== null) setDensity(result.density.toString())
	}

	async function handleEnrich() {
		if (!editIngredient) return
		setIsEnriching(true)

		try {
			const result = await lookupMutation.mutateAsync({
				ingredientName: editIngredient.name,
				unitsOnly: true
			})

			// Update density if AI provided one and current is empty
			if (result.density !== null && !density) {
				setDensity(result.density.toString())
				// Also save to DB
				await updateMutation.mutateAsync({
					id: editIngredient.id,
					density: result.density
				})
			}

			// Add units that don't already exist (by name, case-insensitive)
			const existingUnitNames = new Set(units.map(u => u.name.toLowerCase()))
			const newUnits = result.units.filter(u => !existingUnitNames.has(u.name.toLowerCase()))

			// Create units sequentially to avoid race conditions
			for (const unit of newUnits) {
				await createUnitMutation.mutateAsync({
					ingredientId: editIngredient.id,
					name: unit.name,
					grams: unit.grams,
					isDefault: unit.isDefault && units.length === 0 && newUnits.indexOf(unit) === 0
				})
			}

			utils.ingredient.list.invalidate()
		} finally {
			setIsEnriching(false)
		}
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		const data = {
			name: name.trim(),
			protein: Number.parseFloat(protein) || 0,
			carbs: Number.parseFloat(carbs) || 0,
			fat: Number.parseFloat(fat) || 0,
			kcal: Number.parseFloat(kcal) || 0,
			fiber: Number.parseFloat(fiber) || 0,
			density: density ? Number.parseFloat(density) : null
		}

		if (editIngredient) {
			updateMutation.mutate({ id: editIngredient.id, ...data })
		} else {
			createMutation.mutate({ ...data, source: 'manual' })
		}
	}

	function handleAddUnit(e: React.FormEvent) {
		e.preventDefault()
		if (!(editIngredient && newUnit.name.trim() && newUnit.grams)) return
		const grams = Number.parseFloat(newUnit.grams)
		if (Number.isNaN(grams) || grams <= 0) return

		createUnitMutation.mutate({
			ingredientId: editIngredient.id,
			name: newUnit.name.trim(),
			grams
		})
	}

	const isPending = createMutation.isPending || updateMutation.isPending
	const error = createMutation.error || updateMutation.error || createUnitMutation.error || lookupMutation.error

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && <TRPCError error={error} />}
			<Input placeholder="Ingredient name" value={name} onChange={e => setName(e.target.value)} required />

			<div className="flex items-end gap-2">
				{editIngredient && (
					<Button
						variant="outline"
						size="icon"
						className="size-8 shrink-0"
						onClick={handleRelookup}
						disabled={lookupMutation.isPending || !name.trim()}
						title="Re-lookup macros from USDA/AI"
					>
						<RefreshCw className={`size-3.5 ${lookupMutation.isPending ? 'animate-spin' : ''}`} />
					</Button>
				)}
				<div className="grid flex-1 xs:grid-cols-5 gap-2 max-xs:grid-rows-5">
					<MacroInput label="Protein" value={protein} onChange={setProtein} />
					<MacroInput label="Carbs" value={carbs} onChange={setCarbs} />
					<MacroInput label="Fat" value={fat} onChange={setFat} />
					<MacroInput label="Kcal" value={kcal} onChange={setKcal} />
					<MacroInput label="Fiber" value={fiber} onChange={setFiber} />
				</div>
			</div>
			<p className="text-ink-faint text-xs">Values per 100g raw weight</p>

			<label className="block">
				<span className="mb-1 block text-ink-muted text-xs">Density (g/ml, for volume conversions)</span>
				<NumberInput
					value={density}
					onChange={e => setDensity(e.target.value)}
					placeholder="Optional - for liquids/powders"
					className="w-48"
				/>
			</label>

			{editIngredient && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="block text-ink-muted text-xs">Units</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-6 gap-1 px-2 text-xs"
							onClick={handleEnrich}
							disabled={isEnriching}
							title="Auto-fill units and density from AI"
						>
							<Sparkles className={`size-3 ${isEnriching ? 'animate-pulse' : ''}`} />
							{isEnriching ? 'Loading...' : 'Auto-fill'}
						</Button>
					</div>
					<div className="space-y-1">
						{units.map(unit => (
							<div key={unit.id} className="flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1">
								<span className="font-mono text-sm">{unit.name}</span>
								<span className="text-ink-faint text-xs">= {unit.grams}g</span>
								{unit.isDefault ? (
									<Star className="size-3 fill-accent text-accent" />
								) : (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-5"
										onClick={() => updateUnitMutation.mutate({ id: unit.id, isDefault: true })}
										title="Set as default"
									>
										<Star className="size-3 text-ink-faint" />
									</Button>
								)}
								<span className="text-ink-faint text-xs">({unit.source})</span>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="ml-auto size-5"
									onClick={() => deleteUnitMutation.mutate(unit.id)}
								>
									<Trash2 className="size-3 text-ink-faint" />
								</Button>
							</div>
						))}
						{units.length === 0 && (
							<p className="text-ink-faint text-xs italic">No units defined. Add a unit below.</p>
						)}
					</div>

					<div className="flex items-end gap-2">
						<label className="flex-1">
							<span className="mb-1 block text-ink-faint text-xs">Unit name</span>
							<Input
								placeholder="e.g., tbsp, scoop, pcs"
								value={newUnit.name}
								onChange={e => setNewUnit(u => ({ ...u, name: e.target.value }))}
								className="font-mono text-sm"
							/>
						</label>
						<label className="w-24">
							<span className="mb-1 block text-ink-faint text-xs">Grams</span>
							<NumberInput
								placeholder="g"
								value={newUnit.grams}
								onChange={e => setNewUnit(u => ({ ...u, grams: e.target.value }))}
								className="text-sm"
							/>
						</label>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="size-8"
							onClick={handleAddUnit}
							disabled={!(newUnit.name.trim() && newUnit.grams) || createUnitMutation.isPending}
						>
							<Plus className="size-4" />
						</Button>
					</div>
				</div>
			)}

			<div className="flex items-center justify-end gap-2 pt-2">
				{updateMutation.isSuccess && (
					<span className="flex items-center gap-1 text-sm text-success">
						<Check className="size-4" /> Saved
					</span>
				)}
				<Button type="button" variant="outline" onClick={onClose}>
					{editIngredient ? 'Done' : 'Cancel'}
				</Button>
				<Button type="submit" disabled={!name.trim() || isPending}>
					{editIngredient ? 'Update' : 'Create'}
				</Button>
			</div>
		</form>
	)
}
