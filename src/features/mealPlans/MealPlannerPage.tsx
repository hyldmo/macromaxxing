import type { MealPlan } from '@macromaxxing/db'
import { ArrowLeft, Copy, Trash2 } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Input, Spinner, TRPCError } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { useDocumentTitle } from '~/lib/useDocumentTitle'
import { InventorySidebar } from './components/InventorySidebar'
import { WeekGrid } from './components/WeekGrid'
import { WeeklyAverages } from './components/WeeklyAverages'

export const MealPlannerPage: FC = () => {
	const { id } = useParams<{ id: MealPlan['id'] }>()
	const navigate = useNavigate()
	const [name, setName] = useState('')
	const [hasLoadedPlan, setHasLoadedPlan] = useState(false)
	useDocumentTitle(name || 'Meal Plan')

	const planQuery = trpc.mealPlan.get.useQuery({ id: id! }, { enabled: !!id })

	useEffect(() => {
		if (planQuery.data && !hasLoadedPlan) {
			setName(planQuery.data.name)
			setHasLoadedPlan(true)
		}
	}, [planQuery.data, hasLoadedPlan])

	const utils = trpc.useUtils()

	const updateMutation = trpc.mealPlan.update.useMutation({
		onSuccess: () => utils.mealPlan.get.invalidate({ id: id! })
	})

	const deleteMutation = trpc.mealPlan.delete.useMutation({
		onSuccess: () => navigate('/plans')
	})

	const duplicateMutation = trpc.mealPlan.duplicate.useMutation({
		onSuccess: data => navigate(`/plans/${data.id}`)
	})

	const allocateMutation = trpc.mealPlan.allocate.useMutation({
		onSuccess: () => utils.mealPlan.get.invalidate({ id: id! })
	})

	function handleNameBlur() {
		if (id && name.trim() && name.trim() !== planQuery.data?.name) {
			updateMutation.mutate({ id, name: name.trim() })
		}
	}

	function handleDelete() {
		deleteMutation.mutate({ id: id! })
	}

	function handleDuplicate() {
		duplicateMutation.mutate({ id: id!, newName: `${planQuery.data?.name} (copy)` })
	}

	function handleDrop(dayOfWeek: number, slotIndex: number, inventoryId: string) {
		allocateMutation.mutate({
			inventoryId: inventoryId as Parameters<typeof allocateMutation.mutate>[0]['inventoryId'],
			dayOfWeek,
			slotIndex,
			portions: 1
		})
	}

	if (planQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	if (planQuery.error) {
		return <TRPCError error={planQuery.error} />
	}

	if (!planQuery.data) {
		return <div className="py-12 text-center text-ink-faint">Plan not found</div>
	}

	return (
		<div className="space-y-3">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Link to="/plans">
					<Button variant="ghost" size="icon">
						<ArrowLeft className="size-4" />
					</Button>
				</Link>
				<Input
					value={name}
					onChange={e => setName(e.target.value)}
					onBlur={handleNameBlur}
					className="border-none bg-transparent p-0 font-semibold text-ink text-lg placeholder:text-ink-faint focus-visible:ring-0"
				/>
				<div className="ml-auto flex items-center gap-1">
					<Button variant="ghost" size="sm" onClick={handleDuplicate} disabled={duplicateMutation.isPending}>
						<Copy className="size-4" />
						<span className="hidden sm:inline">Duplicate</span>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={handleDelete}
						disabled={deleteMutation.isPending}
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="size-4" />
						<span className="hidden sm:inline">Delete</span>
					</Button>
				</div>
			</div>

			{updateMutation.error && <TRPCError error={updateMutation.error} />}

			{/* Main layout */}
			<div className="flex gap-4">
				{/* Inventory sidebar (desktop) */}
				<div className="hidden w-56 shrink-0 lg:block">
					<InventorySidebar planId={id!} inventory={planQuery.data.inventory} />
				</div>

				{/* Week grid */}
				<div className="min-w-0 flex-1">
					<WeekGrid inventory={planQuery.data.inventory} onDrop={handleDrop} />
					<div className="mt-3">
						<WeeklyAverages inventory={planQuery.data.inventory} />
					</div>
				</div>
			</div>

			{/* Mobile inventory drawer trigger - simplified for now */}
			<div className="lg:hidden">
				<InventorySidebar planId={id!} inventory={planQuery.data.inventory} />
			</div>
		</div>
	)
}
