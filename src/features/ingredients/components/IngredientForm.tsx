import { type FC, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { TRPCError } from '~/components/ui/TRPCError'
import { type RouterOutput, trpc } from '~/lib/trpc'

export interface IngredientFormProps {
	onClose: () => void
	editIngredient?: RouterOutput['ingredient']['list'][number]
}
export const IngredientForm: FC<IngredientFormProps> = ({ onClose, editIngredient }) => {
	const [name, setName] = useState(editIngredient?.name ?? '')
	const [protein, setProtein] = useState(editIngredient?.protein.toString() ?? '')
	const [carbs, setCarbs] = useState(editIngredient?.carbs.toString() ?? '')
	const [fat, setFat] = useState(editIngredient?.fat.toString() ?? '')
	const [kcal, setKcal] = useState(editIngredient?.kcal.toString() ?? '')
	const [fiber, setFiber] = useState(editIngredient?.fiber.toString() ?? '')
	const utils = trpc.useUtils()

	const createMutation = trpc.ingredient.create.useMutation({
		onSuccess: () => {
			utils.ingredient.listPublic.invalidate()
			onClose()
		}
	})

	const updateMutation = trpc.ingredient.update.useMutation({
		onSuccess: () => {
			utils.ingredient.listPublic.invalidate()
			onClose()
		}
	})

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		const data = {
			name: name.trim(),
			protein: Number.parseFloat(protein) || 0,
			carbs: Number.parseFloat(carbs) || 0,
			fat: Number.parseFloat(fat) || 0,
			kcal: Number.parseFloat(kcal) || 0,
			fiber: Number.parseFloat(fiber) || 0
		}

		if (editIngredient) {
			updateMutation.mutate({ id: editIngredient.id, ...data })
		} else {
			createMutation.mutate({ ...data, source: 'manual' })
		}
	}

	const isPending = createMutation.isPending || updateMutation.isPending
	const error = createMutation.error || updateMutation.error

	return (
		<form onSubmit={handleSubmit} className="space-y-3">
			{error && <TRPCError error={error} />}
			<Input placeholder="Ingredient name" value={name} onChange={e => setName(e.target.value)} required />
			<div className="grid grid-cols-5 gap-2">
				<label>
					<span className="mb-1 block text-macro-protein text-xs">Protein</span>
					<Input
						type="number"
						step="0.1"
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
						step="0.1"
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
						step="0.1"
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
						step="0.1"
						value={fiber}
						onChange={e => setFiber(e.target.value)}
						min={0}
						className="font-mono"
					/>
				</label>
			</div>
			<p className="text-ink-faint text-xs">Values per 100g raw weight</p>
			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={onClose}>
					Cancel
				</Button>
				<Button type="submit" disabled={!name.trim() || isPending}>
					{editIngredient ? 'Update' : 'Create'}
				</Button>
			</div>
		</form>
	)
}
