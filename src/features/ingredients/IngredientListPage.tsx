import { ArrowDown, ArrowUp, NotebookPenIcon, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { USDA } from '~/components/ui/icons'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'
import { useUser } from '~/lib/user'
import { MacroBar } from '../recipes/components/MacroBar'
import { IngredientForm } from './components/IngredientForm'

export function IngredientListPage() {
	const [search, setSearch] = useState('')
	const [showForm, setShowForm] = useState(false)
	const [editId, setEditId] = useState<string | null>(null)
	const [sortKey, setSortKey] = useState<'name' | 'protein' | 'carbs' | 'fat' | 'kcal' | 'fiber'>('name')
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
	const { user } = useUser()
	const userId = user?.id
	const utils = trpc.useUtils()

	const ingredientsQuery = trpc.ingredient.list.useQuery()
	const deleteMutation = trpc.ingredient.delete.useMutation({
		onSuccess: () => utils.ingredient.list.invalidate()
	})

	const toggleSort = (key: typeof sortKey) => {
		if (sortKey === key) {
			setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
		} else {
			setSortKey(key)
			setSortDir(key === 'name' ? 'asc' : 'desc')
		}
	}

	const filtered = useMemo(() => {
		const list = ingredientsQuery.data?.filter(i => i.name.toLowerCase().includes(search.toLowerCase())) ?? []
		return [...list].sort((a, b) => {
			const dir = sortDir === 'asc' ? 1 : -1
			if (sortKey === 'name') return dir * a.name.localeCompare(b.name)
			return dir * (a[sortKey] - b[sortKey])
		})
	}, [ingredientsQuery.data, search, sortKey, sortDir])

	const editIngredient = editId ? ingredientsQuery.data?.find(i => i.id === editId) : undefined

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-ink">Ingredients</h1>
				{user && (
					<Button
						onClick={() => {
							setEditId(null)
							setShowForm(true)
						}}
					>
						<Plus className="size-4" />
						Add Ingredient
					</Button>
				)}
			</div>

			{(showForm || editId) && (
				<Card className="p-4">
					<IngredientForm
						editIngredient={editIngredient}
						onClose={() => {
							setShowForm(false)
							setEditId(null)
						}}
					/>
				</Card>
			)}

			<Input placeholder="Search ingredients..." value={search} onChange={e => setSearch(e.target.value)} />

			{ingredientsQuery.error && <TRPCError error={ingredientsQuery.error} />}
			{deleteMutation.error && <TRPCError error={deleteMutation.error} />}

			{ingredientsQuery.isLoading && (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			)}

			{filtered.length === 0 && !ingredientsQuery.isLoading && (
				<Card className="py-12 text-center text-ink-faint">
					{search ? 'No ingredients match your search.' : 'No ingredients yet.'}
				</Card>
			)}

			{/* Mobile card layout */}
			{filtered.length > 0 && (
				<div className="grid gap-2 md:hidden">
					{filtered.map(ingredient => {
						const isMine = ingredient.userId === userId
						return (
							<div
								key={ingredient.id}
								className="rounded-[--radius-md] border border-edge bg-surface-1 p-3"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="truncate font-medium text-ink text-sm">
												{ingredient.name}
											</span>
											{ingredient.source === 'ai' && (
												<Sparkles className="size-3 shrink-0 text-accent" />
											)}
											{ingredient.source === 'usda' && (
												<USDA className="size-3.5 shrink-0 text-accent" />
											)}
										</div>
										<div className="mt-1 flex flex-wrap gap-2 font-mono text-xs">
											<span className="text-macro-protein">P {ingredient.protein}</span>
											<span className="text-macro-carbs">C {ingredient.carbs}</span>
											<span className="text-macro-fat">F {ingredient.fat}</span>
											<span className="text-macro-kcal">{ingredient.kcal} kcal</span>
											<span className="text-macro-fiber">Fib {ingredient.fiber}</span>
										</div>
										<div className="mt-1.5">
											<MacroBar
												protein={ingredient.protein}
												carbs={ingredient.carbs}
												fat={ingredient.fat}
											/>
										</div>
									</div>
									{isMine && (
										<div className="flex shrink-0 gap-0.5">
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												onClick={() => {
													setEditId(ingredient.id)
													setShowForm(false)
												}}
											>
												<Pencil className="size-3.5 text-ink-faint" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												onClick={() => deleteMutation.mutate(ingredient.id)}
											>
												<Trash2 className="size-3.5 text-ink-faint" />
											</Button>
										</div>
									)}
								</div>
							</div>
						)
					})}
				</div>
			)}

			{/* Desktop table layout */}
			{filtered.length > 0 && (
				<div className="hidden overflow-x-auto rounded-[--radius-md] border border-edge md:block">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-edge border-b bg-surface-2/50 font-medium text-xs">
								{(
									[
										['name', 'Name', 'text-left text-ink-muted'],
										['protein', 'Prot', 'text-right text-macro-protein'],
										['carbs', 'Carbs', 'text-right text-macro-carbs'],
										['fat', 'Fat', 'text-right text-macro-fat'],
										['kcal', 'Kcal', 'text-right text-macro-kcal'],
										['fiber', 'Fiber', 'text-right text-macro-fiber']
									] as const
								).map(([key, label, cls]) => (
									<th key={key} className={`px-2 py-1.5 ${cls}`}>
										<button
											type="button"
											className="inline-flex items-center gap-0.5"
											onClick={() => toggleSort(key)}
										>
											{label}
											{sortKey === key &&
												(sortDir === 'asc' ? (
													<ArrowUp className="size-3" />
												) : (
													<ArrowDown className="size-3" />
												))}
										</button>
									</th>
								))}
								<th className="px-2 py-1.5 text-right text-ink-muted">Src</th>
								<th className="w-16" />
							</tr>
						</thead>
						<tbody>
							{filtered.map(ingredient => {
								const isMine = ingredient.userId === userId
								return (
									<>
										<tr
											key={ingredient.id}
											className="border-edge/50 border-b transition-colors hover:bg-surface-2/50"
										>
											<td className="px-2 py-1.5 font-medium text-ink">{ingredient.name}</td>
											<td className="px-2 py-1.5 text-right font-mono text-macro-protein">
												{ingredient.protein}
											</td>
											<td className="px-2 py-1.5 text-right font-mono text-macro-carbs">
												{ingredient.carbs}
											</td>
											<td className="px-2 py-1.5 text-right font-mono text-macro-fat">
												{ingredient.fat}
											</td>
											<td className="px-2 py-1.5 text-right font-mono text-macro-kcal">
												{ingredient.kcal}
											</td>
											<td className="px-2 py-1.5 text-right font-mono text-macro-fiber">
												{ingredient.fiber}
											</td>
											<td className="px-2 py-1.5 text-right">
												{ingredient.source === 'ai' ? (
													<Sparkles className="ml-auto size-3.5 text-accent" />
												) : ingredient.source === 'usda' ? (
													<USDA className="ml-auto size-4 text-accent" />
												) : (
													<NotebookPenIcon className="ml-auto size-3.5 text-ink-faint" />
												)}
											</td>
											<td className="px-1 py-1.5">
												{isMine && (
													<div className="flex gap-0.5">
														<Button
															variant="ghost"
															size="icon"
															className="size-7"
															onClick={() => {
																setEditId(ingredient.id)
																setShowForm(false)
															}}
														>
															<Pencil className="size-3.5 text-ink-faint" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="size-7"
															onClick={() => deleteMutation.mutate(ingredient.id)}
														>
															<Trash2 className="size-3.5 text-ink-faint" />
														</Button>
													</div>
												)}
											</td>
										</tr>
										<tr key={`${ingredient.id}-bar`} className="border-edge/30 border-b">
											<td colSpan={8} className="px-2 pb-1">
												<MacroBar
													protein={ingredient.protein}
													carbs={ingredient.carbs}
													fat={ingredient.fat}
												/>
											</td>
										</tr>
									</>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
