import { startCase } from 'es-toolkit'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { Button, Card } from '~/components/ui'
import type { RouterOutput } from '~/lib/trpc'

type Exercise = RouterOutput['workout']['listExercises'][number]

const TYPE_BADGE = {
	compound: 'bg-macro-protein/20 text-macro-protein',
	isolation: 'bg-macro-carbs/20 text-macro-carbs'
} as const

function formatRange(min: number | null, max: number | null) {
	if (min == null && max == null) return '—'
	if (min != null && max != null) return `${min}–${max}`
	return `${min ?? max}`
}

export interface ExerciseCardProps {
	exercise: Exercise
	isMine: boolean
	onEdit: (id: string) => void
	onDelete: (id: string) => void
}

export const ExerciseCard: FC<ExerciseCardProps> = ({ exercise, isMine, onEdit, onDelete }) => {
	const primary = exercise.muscles.filter(m => m.intensity >= 0.7)
	const secondary = exercise.muscles.filter(m => m.intensity >= 0.5 && m.intensity < 0.7)

	return (
		<Card className={`p-3 ${isMine ? 'border-accent/40 border-l-2' : ''}`}>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate font-medium text-ink text-sm">{exercise.name}</span>
						{isMine && (
							<span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
								yours
							</span>
						)}
						{!exercise.userId && (
							<a
								href={`${import.meta.env.VITE_REPO_URL}/blob/main/scripts/seed-exercises.ts`}
								target="_blank"
								rel="noopener noreferrer"
								className="shrink-0 text-ink-faint hover:text-ink"
							>
								<ExternalLink className="size-3" />
							</a>
						)}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-1.5">
						<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE[exercise.type]}`}>
							{exercise.type}
						</span>
						<span className="font-mono text-ink-faint text-xs tabular-nums">T{exercise.fatigueTier}</span>
						{primary.map(m => (
							<span
								key={m.muscleGroup}
								className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted"
							>
								{startCase(m.muscleGroup)}
							</span>
						))}
						{secondary.map(m => (
							<span
								key={m.muscleGroup}
								className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint"
							>
								{startCase(m.muscleGroup)}
							</span>
						))}
					</div>
					<div className="mt-1 flex gap-3 font-mono text-[10px] text-ink-faint tabular-nums">
						<span>Str {formatRange(exercise.strengthRepsMin, exercise.strengthRepsMax)}</span>
						<span>Hyp {formatRange(exercise.hypertrophyRepsMin, exercise.hypertrophyRepsMax)}</span>
					</div>
				</div>
				{isMine && (
					<div className="flex shrink-0 gap-0.5">
						<Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(exercise.id)}>
							<Pencil className="size-3.5 text-ink-faint" />
						</Button>
						<Button variant="ghost" size="icon" className="size-7" onClick={() => onDelete(exercise.id)}>
							<Trash2 className="size-3.5 text-ink-faint" />
						</Button>
					</div>
				)}
			</div>
		</Card>
	)
}
