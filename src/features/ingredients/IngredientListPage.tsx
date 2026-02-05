import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { cn } from '~/lib/cn'
import { trpc } from '~/lib/trpc'
import { getUserId } from '~/lib/user'
import { MacroBar } from '../recipes/components/MacroBar'
import { IngredientForm } from './components/IngredientForm'

type Filter = 'all' | 'mine'

export function IngredientListPage() {
	const [search, setSearch] = useState('')
	const [filter, setFilter] = useState<Filter>('all')
	const [showForm, setShowForm] = useState(false)
	const [editId, setEditId] = useState<string | null>(null)
	const userId = getUserId()
	const utils = trpc.useUtils()

	const ingredientsQuery = trpc.ingredient.listPublic.useQuery()
	const deleteMutation = trpc.ingredient.delete.useMutation({
		onSuccess: () => utils.ingredient.listPublic.invalidate()
	})

	const allFiltered = ingredientsQuery.data?.filter(i => i.name.toLowerCase().includes(search.toLowerCase())) ?? []
	const filtered = filter === 'mine' ? allFiltered.filter(i => i.userId === userId) : allFiltered
	const myIngredientCount = ingredientsQuery.data?.filter(i => i.userId === userId).length ?? 0

	const editIngredient = editId ? ingredientsQuery.data?.find(i => i.id === editId) : undefined

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h1 className="font-semibold text-ink">Ingredients</h1>
					<div className="flex gap-1">
						<button
							type="button"
							onClick={() => setFilter('all')}
							className={cn(
								'rounded-full px-2.5 py-0.5 text-xs transition-colors',
								filter === 'all' ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted hover:text-ink'
							)}
						>
							All
						</button>
						<button
							type="button"
							onClick={() => setFilter('mine')}
							className={cn(
								'rounded-full px-2.5 py-0.5 text-xs transition-colors',
								filter === 'mine'
									? 'bg-accent text-white'
									: 'bg-surface-2 text-ink-muted hover:text-ink'
							)}
						>
							Mine{myIngredientCount > 0 && ` (${myIngredientCount})`}
						</button>
					</div>
				</div>
				<Button
					onClick={() => {
						setEditId(null)
						setShowForm(true)
					}}
				>
					<Plus className="size-4" />
					Add Ingredient
				</Button>
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
					{search
						? 'No ingredients match your search.'
						: filter === 'mine'
							? "You haven't added any ingredients yet."
							: 'No ingredients yet.'}
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
								className={cn(
									'rounded-[--radius-md] border bg-surface-1 p-3',
									isMine ? 'border-accent/30' : 'border-edge'
								)}
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
											{isMine && (
												<span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
													yours
												</span>
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
												<Pencil className="h-3.5 w-3.5 text-ink-faint" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												onClick={() => deleteMutation.mutate(ingredient.id)}
											>
												<Trash2 className="h-3.5 w-3.5 text-ink-faint" />
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
								<th className="px-2 py-1.5 text-left text-ink-muted">Name</th>
								<th className="px-2 py-1.5 text-right text-macro-protein">Prot</th>
								<th className="px-2 py-1.5 text-right text-macro-carbs">Carbs</th>
								<th className="px-2 py-1.5 text-right text-macro-fat">Fat</th>
								<th className="px-2 py-1.5 text-right text-macro-kcal">Kcal</th>
								<th className="px-2 py-1.5 text-right text-macro-fiber">Fiber</th>
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
											className={cn(
												'border-edge/50 border-b transition-colors hover:bg-surface-2/50',
												isMine && 'bg-accent/5'
											)}
										>
											<td className="px-2 py-1.5 font-medium text-ink">
												<div className="flex items-center gap-1.5">
													{ingredient.name}
													{isMine && (
														<span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
															yours
														</span>
													)}
												</div>
											</td>
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
													<Sparkles className="ml-auto h-3.5 w-3.5 text-accent" />
												) : (
													<span className="text-ink-faint text-xs">manual</span>
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
															<Pencil className="h-3.5 w-3.5 text-ink-faint" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="size-7"
															onClick={() => deleteMutation.mutate(ingredient.id)}
														>
															<Trash2 className="h-3.5 w-3.5 text-ink-faint" />
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
