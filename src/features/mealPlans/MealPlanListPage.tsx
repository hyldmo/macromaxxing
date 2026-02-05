import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '~/components/ui/Button'
import { Card } from '~/components/ui/Card'
import { Input } from '~/components/ui/Input'
import { Spinner } from '~/components/ui/Spinner'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'

export const MealPlanListPage: FC = () => {
	const [newPlanName, setNewPlanName] = useState('')
	const [isCreating, setIsCreating] = useState(false)

	const plansQuery = trpc.mealPlan.list.useQuery()
	const utils = trpc.useUtils()

	const createMutation = trpc.mealPlan.create.useMutation({
		onSuccess: () => {
			utils.mealPlan.list.invalidate()
			setNewPlanName('')
			setIsCreating(false)
		}
	})

	const deleteMutation = trpc.mealPlan.delete.useMutation({
		onSuccess: () => utils.mealPlan.list.invalidate()
	})

	function handleCreate() {
		if (!newPlanName.trim()) return
		createMutation.mutate({ name: newPlanName.trim() })
	}

	function handleDelete(e: React.MouseEvent, id: string) {
		e.preventDefault()
		e.stopPropagation()
		deleteMutation.mutate({ id: id as Parameters<typeof deleteMutation.mutate>[0]['id'] })
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-ink">Meal Plans</h1>
				{!isCreating && (
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
							placeholder="Plan name (e.g., Cutting Week)"
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
						<Button onClick={handleCreate} disabled={!newPlanName.trim() || createMutation.isPending}>
							{createMutation.isPending ? <Spinner className="size-4" /> : 'Create'}
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

			<div className="grid gap-2">
				{plansQuery.data?.map(plan => (
					<Link key={plan.id} to={`/plans/${plan.id}`}>
						<div className="flex items-center gap-4 rounded-[--radius-md] border border-edge bg-surface-1 p-3 transition-colors hover:bg-surface-2">
							<div className="flex size-10 items-center justify-center rounded-[--radius-sm] bg-accent/10 text-accent">
								<CalendarDays className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<h2 className="truncate font-medium text-ink text-sm">{plan.name}</h2>
								<p className="text-ink-faint text-xs">{plan.inventory.length} recipes in inventory</p>
							</div>
							<button
								type="button"
								onClick={e => handleDelete(e, plan.id)}
								className="rounded-[--radius-sm] p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-destructive"
							>
								<Trash2 className="size-4" />
							</button>
						</div>
					</Link>
				))}
			</div>
		</div>
	)
}
