import { startCase } from 'es-toolkit'
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '~/components/ui'
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

type SortKey = 'name' | 'type' | 'tier'

export interface ExerciseTableProps {
	exercises: Exercise[]
	userId: string | undefined
	sortKey: SortKey
	sortDir: 'asc' | 'desc'
	onToggleSort: (key: SortKey) => void
	onHover: (exercise: Exercise | null) => void
	onEdit: (id: string) => void
	onDelete: (id: string) => void
}

export const ExerciseTable: FC<ExerciseTableProps> = ({
	exercises,
	userId,
	sortKey,
	sortDir,
	onToggleSort,
	onHover,
	onEdit,
	onDelete
}) => (
	<div className="hidden overflow-x-auto rounded-md border border-edge md:block">
		<table className="w-full text-sm">
			<thead>
				<tr className="border-edge border-b bg-surface-2/50 font-medium text-xs">
					{(
						[
							['name', 'Name', 'text-left text-ink-muted'],
							['type', 'Type', 'text-left text-ink-muted'],
							['tier', 'Tier', 'text-right text-ink-muted']
						] as const
					).map(([key, label, cls]) => (
						<th key={key} className={`px-2 py-1.5 ${cls}`}>
							<button
								type="button"
								className="inline-flex items-center gap-0.5"
								onClick={() => onToggleSort(key)}
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
					<th className="px-2 py-1.5 text-right text-ink-muted">Str Range</th>
					<th className="px-2 py-1.5 text-right text-ink-muted">Hyp Range</th>
					<th className="px-2 py-1.5 text-left text-ink-muted">Muscles</th>
					<th className="w-16" />
				</tr>
			</thead>
			<tbody>
				{exercises.map(exercise => {
					const isMine = exercise.userId === userId
					const primary = exercise.muscles.filter(m => m.intensity >= 0.7)
					const secondary = exercise.muscles.filter(m => m.intensity >= 0.5 && m.intensity < 0.7)
					return (
						<tr
							key={exercise.id}
							className={`border-edge/30 border-b transition-colors hover:bg-surface-2/50 ${isMine ? 'border-l-2 border-l-accent/40' : ''}`}
							onMouseEnter={() => onHover(exercise)}
							onMouseLeave={() => onHover(null)}
						>
							<td className="px-2 py-1.5 font-medium text-ink">
								<div className="flex items-center gap-1.5">
									{exercise.name}
									{isMine && (
										<span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
											yours
										</span>
									)}
									{!exercise.userId && (
										<a
											href={`${import.meta.env.VITE_REPO_URL}/blob/main/scripts/seed-exercises.ts`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-ink-faint hover:text-ink"
										>
											<ExternalLink className="size-3" />
										</a>
									)}
								</div>
							</td>
							<td className="px-2 py-1.5">
								<span className={`rounded-full px-1.5 py-0.5 text-[10px] ${TYPE_BADGE[exercise.type]}`}>
									{exercise.type}
								</span>
							</td>
							<td className="px-2 py-1.5 text-right font-mono tabular-nums">{exercise.fatigueTier}</td>
							<td className="px-2 py-1.5 text-right font-mono tabular-nums">
								{formatRange(exercise.strengthRepsMin, exercise.strengthRepsMax)}
							</td>
							<td className="px-2 py-1.5 text-right font-mono tabular-nums">
								{formatRange(exercise.hypertrophyRepsMin, exercise.hypertrophyRepsMax)}
							</td>
							<td className="px-2 py-1.5">
								<div className="flex flex-wrap gap-1">
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
							</td>
							<td className="px-1 py-1.5">
								{isMine && (
									<div className="flex gap-0.5">
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => onEdit(exercise.id)}
										>
											<Pencil className="size-3.5 text-ink-faint" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => onDelete(exercise.id)}
										>
											<Trash2 className="size-3.5 text-ink-faint" />
										</Button>
									</div>
								)}
							</td>
						</tr>
					)
				})}
			</tbody>
		</table>
	</div>
)
