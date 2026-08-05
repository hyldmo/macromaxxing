import type { WeekStart } from '@macromaxxing/db'
import { Plus, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Input, Select, Spinner, TRPCError } from '~/components/ui'
import { cn, fromDateKey, getISOWeek, getWeekStart, getWeekStartDate, mealPlanLabel, toDateKey, useUser } from '~/lib'
import { trpc } from '~/lib/trpc'

const WEEK_MS = 604_800_000

/** `Select` can't carry null, so the "no week" choice rides as a sentinel value. */
const TEMPLATE = 'template'

/** Weeks a new plan can target: last week (backfilling a log) through three weeks out. */
function weekOptions(now: number): { value: WeekStart; label: string }[] {
	const thisMonday = getWeekStart(now)
	return [-1, 0, 1, 2, 3].map(offset => {
		const monday = thisMonday + offset * WEEK_MS
		const relative = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : null
		return {
			value: toDateKey(monday),
			label: `W${getISOWeek(monday)}${relative ? ` · ${relative}` : ''}`
		}
	})
}

export const MealPlansSection: FC = () => {
	const [newPlanName, setNewPlanName] = useState('')
	const [isCreating, setIsCreating] = useState(false)
	const [now] = useState(() => Date.now())
	const weeks = weekOptions(now)
	// Default to the week you're in — the overwhelmingly common case is logging or planning it.
	const [newPlanWeek, setNewPlanWeek] = useState<WeekStart | typeof TEMPLATE>(() => getWeekStartDate(now))
	const { user } = useUser()

	const plansQuery = trpc.mealPlan.list.useQuery()
	const utils = trpc.useUtils()

	const createMutation = trpc.mealPlan.create.useMutation({
		onSuccess: () => {
			utils.mealPlan.list.invalidate()
			setNewPlanName('')
			setNewPlanWeek(getWeekStartDate(now))
			setIsCreating(false)
		}
	})

	const deleteMutation = trpc.mealPlan.delete.useMutation({
		onSuccess: () => utils.mealPlan.list.invalidate()
	})

	function handleCreate() {
		createMutation.mutate({
			// Unnamed is the common case — the plan reads as its week number.
			name: newPlanName.trim() || null,
			weekStart: newPlanWeek === TEMPLATE ? null : newPlanWeek
		})
	}

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-ink">Meal Plans</h2>
				{user && !isCreating && (
					<Button onClick={() => setIsCreating(true)}>
						<Plus className="size-4" />
						New Plan
					</Button>
				)}
			</div>

			{isCreating && (
				<Card className="p-3">
					<div className="flex items-center gap-2">
						<Input
							placeholder="Name (optional, e.g. Cutting Week)"
							value={newPlanName}
							onChange={e => setNewPlanName(e.target.value)}
							onKeyDown={e => {
								if (e.key === 'Enter') handleCreate()
								if (e.key === 'Escape') {
									setIsCreating(false)
									setNewPlanName('')
								}
							}}
							autoFocus
							className="flex-1"
						/>
						<Select
							value={newPlanWeek}
							onChange={setNewPlanWeek}
							options={[...weeks, { value: TEMPLATE, label: 'Template · no week' }]}
							className="w-auto"
						/>
						<Button onClick={handleCreate} disabled={createMutation.isPending}>
							{createMutation.isPending ? <Spinner className="size-4 text-current" /> : 'Create'}
						</Button>
						<Button
							variant="ghost"
							onClick={() => {
								setIsCreating(false)
								setNewPlanName('')
							}}
						>
							Cancel
						</Button>
					</div>
					{createMutation.error && <TRPCError error={createMutation.error} className="mt-2" />}
				</Card>
			)}

			{plansQuery.isLoading && (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			)}

			{plansQuery.error && <TRPCError error={plansQuery.error} />}

			{plansQuery.data?.length === 0 && !isCreating && (
				<Card className="py-12 text-center text-ink-faint">No meal plans yet. Create your first one!</Card>
			)}

			<div className="grid grid-cols-1 gap-2">
				{plansQuery.data?.map(plan => (
					<Link key={plan.id} to={`/plans/${plan.id}`}>
						<Card className="flex items-center gap-4 p-3 transition-colors hover:bg-surface-2">
							<div
								className={cn(
									'flex size-10 flex-col items-center justify-center rounded-sm',
									plan.weekStart ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-ink-faint'
								)}
							>
								<span className="font-mono text-[10px] tabular-nums leading-none">
									{plan.weekStart ? `W${getISOWeek(fromDateKey(plan.weekStart))}` : 'TPL'}
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="truncate font-medium text-ink text-sm">{mealPlanLabel(plan)}</h3>
								<p className="text-ink-faint text-xs">{plan.inventory.length} recipes in inventory</p>
							</div>
							<button
								type="button"
								onClick={e => {
									e.preventDefault()
									e.stopPropagation()
									deleteMutation.mutate({ id: plan.id })
								}}
								className="rounded-sm p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-destructive"
							>
								<Trash2 className="size-4" />
							</button>
						</Card>
					</Link>
				))}
			</div>
		</section>
	)
}
