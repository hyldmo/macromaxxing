import { Plus, Star, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { TRPCError } from '~/components/ui/TRPCError'
import { type RouterOutput, trpc } from '~/lib/trpc'

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
	const utils = trpc.useUtils()

	const units = editIngredient?.units ?? []

	const createMutation = trpc.ingredient.create.useMutation({
		onSuccess: () => {
			utils.ingredient.listPublic.invalidate()
			onClose()
		}
	})

	const updateMutation = trpc.ingredient.update.useMutation({
		onSuccess: () => {
			utils.ingredient.listPublic.invalidate()
		}
	})

	const createUnitMutation = trpc.ingredient.createUnit.useMutation({
		onSuccess: () => {
			utils.ingredient.listPublic.invalidate()
			setNewUnit({ name: '', grams: '' })
		}
	})

	const updateUnitMutation = trpc.ingredient.updateUnit.useMutation({
		onSuccess: () => utils.ingredient.listPublic.invalidate()
	})

	const deleteUnitMutation = trpc.ingredient.deleteUnit.useMutation({
		onSuccess: () => utils.ingredient.listPublic.invalidate()
	})

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

	function handleSetDefault(unitId: string) {
		updateUnitMutation.mutate({
			id: unitId as Parameters<typeof updateUnitMutation.mutate>[0]['id'],
			isDefault: true
		})
	}

	function handleDeleteUnit(unitId: string) {
		deleteUnitMutation.mutate(unitId as Parameters<typeof deleteUnitMutation.mutate>[0])
	}

	const isPending = createMutation.isPending || updateMutation.isPending
	const error = createMutation.error || updateMutation.error || createUnitMutation.error

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && <TRPCError error={error} />}
			<Input placeholder="Ingredient name" value={name} onChange={e => setName(e.target.value)} required />

			<div className="grid grid-cols-5 gap-2">
				<label>
					<span className="mb-1 block text-macro-protein text-xs">Protein</span>
					<Input
						type="number"
						step="0.01"
						value={protein}
						onChange={e => setProtein(e.target.value)}
						min={0}
						className="font-mono"
					/>
				</label>
				<label>
					<span className="mb-1 block text-macro-carbs text-xs">Carbs</span>
					<Input
						type="number"
						step="0.01"
						value={carbs}
						onChange={e => setCarbs(e.target.value)}
						min={0}
						className="font-mono"
					/>
				</label>
				<label>
					<span className="mb-1 block text-macro-fat text-xs">Fat</span>
					<Input
						type="number"
						step="0.01"
						value={fat}
						onChange={e => setFat(e.target.value)}
						min={0}
						className="font-mono"
					/>
				</label>
				<label>
					<span className="mb-1 block text-macro-kcal text-xs">Kcal</span>
					<Input
						type="number"
						step="1"
						value={kcal}
						onChange={e => setKcal(e.target.value)}
						min={0}
						className="font-mono"
					/>
				</label>
				<label>
					<span className="mb-1 block text-macro-fiber text-xs">Fiber</span>
					<Input
						type="number"
						step="0.01"
						value={fiber}
						onChange={e => setFiber(e.target.value)}
						min={0}
						className="font-mono"
					/>
				</label>
			</div>
			<p className="text-ink-faint text-xs">Values per 100g raw weight</p>

			<label className="block">
				<span className="mb-1 block text-ink-muted text-xs">Density (g/ml, for volume conversions)</span>
				<Input
					type="number"
					step="0.01"
					value={density}
					onChange={e => setDensity(e.target.value)}
					min={0}
					placeholder="Optional - for liquids/powders"
					className="w-48 font-mono"
				/>
			</label>

			{editIngredient && (
				<div className="space-y-2">
					<span className="block text-ink-muted text-xs">Units</span>
					<div className="space-y-1">
						{units.map(unit => (
							<div
								key={unit.id}
								className="flex items-center gap-2 rounded-[--radius-sm] bg-surface-2 px-2 py-1"
							>
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
										onClick={() => handleSetDefault(unit.id)}
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
									onClick={() => handleDeleteUnit(unit.id)}
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
							<Input
								type="number"
								step="0.1"
								min={0}
								placeholder="g"
								value={newUnit.grams}
								onChange={e => setNewUnit(u => ({ ...u, grams: e.target.value }))}
								className="font-mono text-sm"
							/>
						</label>
						<Button
							type="button"
							variant="outline"
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

			<div className="flex justify-end gap-2 pt-2">
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
