import { Globe, X } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '~/components/ui/Button'
import { Input } from '~/components/ui/Input'
import { NumberInput } from '~/components/ui/NumberInput'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { type RouterOutput, trpc } from '~/lib/trpc'

type PremadeRecipe = NonNullable<RouterOutput['recipe']['addPremade']>

export interface PremadeDialogProps {
	open: boolean
	onClose: () => void
	onCreated?: (recipe: PremadeRecipe) => void
}

export const PremadeDialog: FC<PremadeDialogProps> = ({ open, onClose, onCreated }) => {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [servingSize, setServingSize] = useState('')
	const [servings, setServings] = useState('1')
	const [protein, setProtein] = useState('')
	const [carbs, setCarbs] = useState('')
	const [fat, setFat] = useState('')
	const [kcal, setKcal] = useState('')
	const [fiber, setFiber] = useState('')

	const utils = trpc.useUtils()

	const parseProduct = trpc.ai.parseProduct.useMutation({
		onSuccess: data => {
			setName(data.name)
			setServingSize(String(data.servingSize))
			if (data.servings != null) setServings(String(data.servings))
			setProtein(String(data.protein))
			setCarbs(String(data.carbs))
			setFat(String(data.fat))
			setKcal(String(data.kcal))
			setFiber(String(data.fiber))
		}
	})

	const addPremade = trpc.recipe.addPremade.useMutation({
		onSuccess: recipe => {
			if (!recipe) return
			utils.recipe.list.invalidate()
			onCreated?.(recipe)
			onClose()
		}
	})

	// Reset state when dialog closes
	const resetAdd = addPremade.reset
	const resetParse = parseProduct.reset
	useEffect(() => {
		if (!open) {
			setName('')
			setUrl('')
			setServingSize('')
			setServings('1')
			setProtein('')
			setCarbs('')
			setFat('')
			setKcal('')
			setFiber('')
			resetAdd()
			resetParse()
		}
	}, [open, resetAdd, resetParse])

	// Close on Escape
	useEffect(() => {
		if (!open) return
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [open, onClose])

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		const sz = Number.parseFloat(servingSize)
		const sv = Number.parseFloat(servings) || 1
		if (!(name.trim() && sz)) return

		addPremade.mutate({
			name: name.trim(),
			servingSize: sz,
			servings: sv,
			protein: Number.parseFloat(protein) || 0,
			carbs: Number.parseFloat(carbs) || 0,
			fat: Number.parseFloat(fat) || 0,
			kcal: Number.parseFloat(kcal) || 0,
			fiber: Number.parseFloat(fiber) || 0,
			sourceUrl: url.trim() || null
		})
	}

	const canSubmit = name.trim() && Number.parseFloat(servingSize) > 0

	if (!open) return null

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div className="w-full max-w-sm rounded-[--radius-md] border border-edge bg-surface-0">
				{/* Header */}
				<div className="flex items-center justify-between border-edge border-b px-4 py-3">
					<h2 className="font-semibold text-ink">Add Premade</h2>
					<Button variant="ghost" size="icon" onClick={onClose} disabled={addPremade.isPending}>
						<X className="size-4" />
					</Button>
				</div>

				{/* Content */}
				<form onSubmit={handleSubmit} className="space-y-3 p-4">
					<div className="flex gap-2">
						<Input
							placeholder="https://example.com/product..."
							value={url}
							onChange={e => setUrl(e.target.value)}
							autoFocus
							className="flex-1"
						/>
						<Button
							type="button"
							variant="outline"
							disabled={!url.trim() || parseProduct.isPending}
							onClick={() => parseProduct.mutate({ url: url.trim() })}
						>
							{parseProduct.isPending ? (
								<Spinner className="size-4 text-current" />
							) : (
								<Globe className="size-4" />
							)}
							Fetch
						</Button>
					</div>

					{parseProduct.error && <TRPCError error={parseProduct.error} />}

					<div className="flex items-center gap-3">
						<div className="h-px flex-1 bg-edge" />
						<span className="text-ink-faint text-xs">or enter manually</span>
						<div className="h-px flex-1 bg-edge" />
					</div>

					<Input placeholder="Product name" value={name} onChange={e => setName(e.target.value)} />

					<div className="grid grid-cols-2 gap-2">
						<label>
							<span className="mb-1 block text-ink-muted text-xs">Serving size (g)</span>
							<NumberInput
								value={servingSize}
								onChange={e => setServingSize(e.target.value)}
								placeholder="e.g. 60"
							/>
						</label>
						<label>
							<span className="mb-1 block text-ink-muted text-xs">Servings</span>
							<NumberInput value={servings} onChange={e => setServings(e.target.value)} placeholder="1" />
						</label>
					</div>

					<div className="space-y-1.5">
						<span className="text-ink-muted text-xs">Per serving</span>
						<div className="grid grid-cols-5 gap-2">
							<label>
								<span className="mb-1 block text-macro-protein text-xs">Protein</span>
								<NumberInput value={protein} onChange={e => setProtein(e.target.value)} />
							</label>
							<label>
								<span className="mb-1 block text-macro-carbs text-xs">Carbs</span>
								<NumberInput value={carbs} onChange={e => setCarbs(e.target.value)} />
							</label>
							<label>
								<span className="mb-1 block text-macro-fat text-xs">Fat</span>
								<NumberInput value={fat} onChange={e => setFat(e.target.value)} />
							</label>
							<label>
								<span className="mb-1 block text-macro-kcal text-xs">Kcal</span>
								<NumberInput value={kcal} onChange={e => setKcal(e.target.value)} />
							</label>
							<label>
								<span className="mb-1 block text-macro-fiber text-xs">Fiber</span>
								<NumberInput value={fiber} onChange={e => setFiber(e.target.value)} />
							</label>
						</div>
					</div>

					{addPremade.error && <TRPCError error={addPremade.error} />}

					<div className="flex justify-end gap-2 pt-1">
						<Button type="button" variant="ghost" onClick={onClose} disabled={addPremade.isPending}>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit || addPremade.isPending}>
							{addPremade.isPending ? (
								<>
									<Spinner className="size-4 text-current" />
									Adding...
								</>
							) : (
								'Add'
							)}
						</Button>
					</div>
				</form>
			</div>
		</div>,
		document.body
	)
}
