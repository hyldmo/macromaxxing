import type { TypeIDString } from '@macromaxxing/db'
import { Star } from 'lucide-react'
import { type FC, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '~/components/ui'
import { cn, computeProgramLoad } from '~/lib'
import type { RouterOutput } from '~/lib/trpc'

type WorkoutTemplate = RouterOutput['workout']['listWorkouts'][number]

export interface ProgramCardProps {
	program: {
		id: TypeIDString<'wpr'>
		name: string
		workouts: { id: TypeIDString<'wkt'>; name: string }[]
	}
	templates: readonly WorkoutTemplate[]
	isActive: boolean
	onToggleActive: () => void
	isToggling: boolean
}

export const ProgramCard: FC<ProgramCardProps> = ({ program, templates, isActive, onToggleActive, isToggling }) => {
	const itemNames = program.workouts.map(w => w.name).join(', ')
	const count = program.workouts.length

	const stats = useMemo(() => {
		if (count === 0 || templates.length === 0) return null
		const byId = new Map(templates.map(t => [t.id, t]))
		const resolved = program.workouts.flatMap(w => {
			const t = byId.get(w.id)
			return t ? [t] : []
		})
		if (resolved.length === 0) return null
		return computeProgramLoad(resolved)
	}, [program.workouts, templates, count])

	return (
		<Card
			className={cn(
				'flex items-center gap-3 p-3 transition-colors hover:bg-surface-2',
				isActive && 'border-accent'
			)}
		>
			<Button
				variant="ghost"
				size="icon"
				onClick={onToggleActive}
				disabled={isToggling}
				aria-label={isActive ? 'Deactivate program' : 'Activate program'}
				title={isActive ? 'Active — click to deactivate' : 'Set as active'}
			>
				<Star
					className={cn('size-4 cursor-pointer', isActive ? 'fill-accent text-accent' : 'text-ink-faint')}
				/>
			</Button>
			<Link to={`/plans/programs/${program.id}`} className="min-w-0 flex-1">
				<h3 className="truncate font-medium text-ink text-sm">{program.name}</h3>
				<p className="truncate font-mono text-ink-faint text-xs tabular-nums">
					{count === 0 ? '(empty)' : `${count} workout${count === 1 ? '' : 's'} · ${itemNames}`}
				</p>
				{stats && (
					<p className="font-mono text-ink-faint text-xs tabular-nums">
						{stats.totals.workingSets.toFixed(0)} sets/cycle
						{stats.belowMev.length > 0 && (
							<span className="text-amber-500"> · {stats.belowMev.length} below MEV</span>
						)}
					</p>
				)}
			</Link>
		</Card>
	)
}
