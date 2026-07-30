import { Globe, ScanLine, X } from 'lucide-react'
import { type FC, useCallback, useEffect, useState } from 'react'
import { Button, Input, Modal, NumberInput, Spinner, TRPCError } from '~/components/ui'
import { MacroInput } from '~/features/ingredients'
import type { OFFProduct } from '~/lib'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { BarcodeLookup } from './BarcodeLookup'

type PremadeRecipe = NonNullable<RouterOutput['recipe']['addPremade']>

/** Form values carry more precision than the display: a 10 g serving amplifies each rounded digit 10× */
const fmt = (value: number) => String(Math.round(value * 100) / 100)

export interface PremadeDialogProps {
	open: boolean
	onClose: () => void
	onCreated?: (recipe: PremadeRecipe) => void
	/** Open straight into the barcode scanner (entry point is a "Scan" button, not "Premade") */
	autoScan?: boolean
}

export const PremadeDialog: FC<PremadeDialogProps> = ({ open, onClose, onCreated, autoScan = false }) => {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [servingSize, setServingSize] = useState('')
	const [servings, setServings] = useState('1')
	const [protein, setProtein] = useState('')
	const [carbs, setCarbs] = useState('')
	const [fat, setFat] = useState('')
	const [kcal, setKcal] = useState('')
	const [fiber, setFiber] = useState('')
	const [barcodeActive, setBarcodeActive] = useState(autoScan)
	const [barcode, setBarcode] = useState<string | null>(null)
	// OFF records drink servings in ml. We store grams, so say so rather than mislabelling the number.
	const [servingUnit, setServingUnit] = useState<string | null>(null)

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
			setBarcodeActive(autoScan)
			setBarcode(null)
			setServingUnit(null)
			resetAdd()
			resetParse()
		}
	}, [open, autoScan, resetAdd, resetParse])

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
			sourceUrl: url.trim() || null,
			sourceId: barcode
		})
	}

	const handleBarcodeProduct = useCallback((product: OFFProduct) => {
		setName(product.name)
		// OFF records with no serving describe 100 g; keep that explicit rather than inventing a package
		setServingSize(String(product.servingSize ?? 100))
		setServingUnit(product.servingUnit)
		if (product.servings != null) setServings(String(product.servings))
		setProtein(fmt(product.perServing.protein))
		setCarbs(fmt(product.perServing.carbs))
		setFat(fmt(product.perServing.fat))
		setKcal(fmt(product.perServing.kcal))
		setFiber(fmt(product.perServing.fiber))
		setBarcode(product.barcode)
		setUrl(`https://world.openfoodfacts.org/product/${product.barcode}`)
	}, [])

	const canSubmit = name.trim() && Number.parseFloat(servingSize) > 0

	// The per-100 column is what's printed on the packet, so it's the one worth checking the entry against
	const servingGrams = Number.parseFloat(servingSize)
	const per100 =
		servingGrams > 0
			? {
					protein: ((Number.parseFloat(protein) || 0) / servingGrams) * 100,
					carbs: ((Number.parseFloat(carbs) || 0) / servingGrams) * 100,
					fat: ((Number.parseFloat(fat) || 0) / servingGrams) * 100,
					kcal: ((Number.parseFloat(kcal) || 0) / servingGrams) * 100,
					fiber: ((Number.parseFloat(fiber) || 0) / servingGrams) * 100
				}
			: null

	if (!open) return null

	return (
		<Modal className="w-full max-w-sm">
			{/* Header */}
			<div className="flex items-center justify-between border-edge border-b px-4 py-3">
				<h2 className="font-semibold text-ink">Add Premade</h2>
				<Button variant="ghost" size="icon" onClick={onClose} disabled={addPremade.isPending}>
					<X className="size-4" />
				</Button>
			</div>

			{/* Content */}
			<form onSubmit={handleSubmit} className="space-y-3 p-4">
				{barcodeActive ? (
					<BarcodeLookup
						active
						onProductFound={p => {
							handleBarcodeProduct(p)
							setBarcodeActive(false)
						}}
						onClose={() => setBarcodeActive(false)}
					/>
				) : (
					<Button type="button" variant="outline" className="w-full" onClick={() => setBarcodeActive(true)}>
						<ScanLine className="size-4" />
						Scan barcode
					</Button>
				)}

				<div className="flex items-center gap-3">
					<div className="h-px flex-1 bg-edge" />
					<span className="text-ink-faint text-xs">or fetch from URL</span>
					<div className="h-px flex-1 bg-edge" />
				</div>

				<div className="flex gap-2">
					<Input
						placeholder="https://example.com/product..."
						value={url}
						onChange={e => setUrl(e.target.value)}
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

				{servingUnit && servingUnit !== 'g' && (
					<p className="text-ink-faint text-xs">
						Listed as {servingSize} {servingUnit}, stored as grams.
					</p>
				)}

				<div className="space-y-1.5">
					<span className="text-ink-muted text-xs">Per serving</span>
					<div className="grid grid-cols-5 gap-2">
						<MacroInput label="Protein" value={protein} onChange={setProtein} />
						<MacroInput label="Carbs" value={carbs} onChange={setCarbs} />
						<MacroInput label="Fat" value={fat} onChange={setFat} />
						<MacroInput label="Kcal" value={kcal} onChange={setKcal} />
						<MacroInput label="Fiber" value={fiber} onChange={setFiber} />
					</div>
				</div>

				{per100 && (
					<div className="rounded-sm border border-edge px-2.5 py-2">
						<div className="font-semibold text-[10px] text-ink-faint uppercase tracking-wider">
							Per 100 g
						</div>
						<div className="mt-1 flex items-center gap-3 font-mono text-xs tabular-nums">
							<span className="text-macro-protein">P{per100.protein.toFixed(1)}</span>
							<span className="text-macro-carbs">C{per100.carbs.toFixed(1)}</span>
							<span className="text-macro-fat">F{per100.fat.toFixed(1)}</span>
							<span className="text-macro-kcal">{per100.kcal.toFixed(0)}</span>
							<span className="text-macro-fiber">Fb{per100.fiber.toFixed(1)}</span>
						</div>
					</div>
				)}

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
		</Modal>
	)
}
