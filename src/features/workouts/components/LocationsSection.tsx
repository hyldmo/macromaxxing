import type { Equipment } from '@macromaxxing/db'
import { Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { type FC, useState } from 'react'
import { Button, Card, CardContent, CardHeader, Input, TRPCError } from '~/components/ui'
import { type RouterOutput, trpc } from '~/lib/trpc'
import { EquipmentChecklist } from './EquipmentChecklist'

type Location = RouterOutput['workout']['listLocations'][number]

export const LocationsSection: FC = () => {
	const utils = trpc.useUtils()
	const locationsQuery = trpc.workout.listLocations.useQuery()
	const createMutation = trpc.workout.createLocation.useMutation({
		onSuccess: () => {
			utils.workout.listLocations.invalidate()
			setName('')
		}
	})

	const [name, setName] = useState('')

	function handleCreate(e: React.FormEvent) {
		e.preventDefault()
		if (!name.trim()) return
		createMutation.mutate({ name: name.trim(), equipment: [] })
	}

	return (
		<Card>
			<CardHeader>
				<h2 className="font-medium text-ink text-sm">Training Locations</h2>
				<p className="text-ink-muted text-xs">
					Places you train and the equipment each has. Workouts tagged with a location warn when an exercise
					needs equipment that isn't there.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<form onSubmit={handleCreate} className="flex items-end gap-2">
					<div className="min-w-0 flex-1 space-y-1">
						<span className="text-ink-muted text-sm">New Location</span>
						<Input
							placeholder="Location name (e.g. Home, SATS Bislett)"
							value={name}
							onChange={e => setName(e.target.value)}
						/>
					</div>
					<Button type="submit" disabled={!name.trim() || createMutation.isPending}>
						{createMutation.isPending ? 'Adding...' : 'Add'}
					</Button>
				</form>
				{createMutation.error && <TRPCError error={createMutation.error} />}

				{locationsQuery.data && locationsQuery.data.length > 0 && (
					<div className="divide-y divide-edge rounded-md border border-edge">
						{locationsQuery.data.map(location => (
							<LocationRow key={location.id} location={location} />
						))}
					</div>
				)}
				{locationsQuery.error && <TRPCError error={locationsQuery.error} />}
			</CardContent>
		</Card>
	)
}

interface LocationRowProps {
	location: Location
}

const LocationRow: FC<LocationRowProps> = ({ location }) => {
	const utils = trpc.useUtils()
	const [expanded, setExpanded] = useState(location.equipment.length === 0)
	const [editName, setEditName] = useState(location.name)

	const updateMutation = trpc.workout.updateLocation.useMutation({
		onSuccess: () => utils.workout.listLocations.invalidate()
	})
	const deleteMutation = trpc.workout.deleteLocation.useMutation({
		onSuccess: () => utils.workout.listLocations.invalidate()
	})

	const equipment: Equipment[] = location.equipment.map(e => e.equipment)
	const trimmedName = editName.trim()

	return (
		<div className="space-y-2 px-3 py-2">
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
					onClick={() => setExpanded(!expanded)}
				>
					{expanded ? (
						<ChevronDown className="size-3.5 shrink-0 text-ink-faint" />
					) : (
						<ChevronRight className="size-3.5 shrink-0 text-ink-faint" />
					)}
					<span className="truncate text-ink text-sm">{location.name}</span>
					<span className="font-mono text-ink-faint text-xs tabular-nums">
						{location.equipment.length} items
					</span>
				</button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={() => deleteMutation.mutate({ id: location.id })}
					disabled={deleteMutation.isPending}
				>
					<Trash2 className="size-3.5 text-ink-faint" />
				</Button>
			</div>

			{expanded && (
				<div className="space-y-2 pl-5">
					<div className="flex items-center gap-2">
						<Input
							value={editName}
							onChange={e => setEditName(e.target.value)}
							className="h-7 max-w-64 text-sm"
						/>
						{trimmedName !== location.name && (
							<Button
								size="sm"
								className="h-7"
								disabled={!trimmedName || updateMutation.isPending}
								onClick={() => updateMutation.mutate({ id: location.id, name: trimmedName })}
							>
								<Check className="size-3.5" />
								Rename
							</Button>
						)}
					</div>
					<EquipmentChecklist
						selected={equipment}
						onChange={next => updateMutation.mutate({ id: location.id, equipment: next })}
						disabled={updateMutation.isPending}
					/>
				</div>
			)}

			{updateMutation.error && <TRPCError error={updateMutation.error} />}
			{deleteMutation.error && <TRPCError error={deleteMutation.error} />}
		</div>
	)
}
