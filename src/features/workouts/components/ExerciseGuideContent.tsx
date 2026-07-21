import { type Equipment, type Exercise, formatEquipment } from '@macromaxxing/db'
import { ExternalLink } from 'lucide-react'
import type { FC } from 'react'
import { Spinner } from '~/components/ui'
import { useUser } from '~/lib'
import { trpc } from '~/lib/trpc'

const youtubeSearchUrl = (exerciseName: string): string =>
	`https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} proper form`)}`

export interface ExerciseGuideContentProps {
	exerciseId: Exercise['id']
	exerciseName: string
	/** When set, shown as tags. When omitted, looked up from listExercises (signed-in only). */
	equipment?: Equipment[]
	/** Hide equipment tags when the parent already surfaces them (e.g. exercise detail). Default true. */
	showEquipment?: boolean
}

/**
 * Body of an exercise technique guide. Used inline on `/exercises/:id` and
 * wrapped in a full-screen overlay by `ExerciseGuideModal` (timer mode).
 *
 * Renders no chrome of its own — the parent supplies headings, padding, etc.
 */
export const ExerciseGuideContent: FC<ExerciseGuideContentProps> = ({
	exerciseId,
	exerciseName,
	equipment: equipmentProp,
	showEquipment = true
}) => {
	const { isSignedIn } = useUser()
	const guideQuery = trpc.workout.getGuide.useQuery({ exerciseId })
	const exercisesQuery = trpc.workout.listExercises.useQuery(undefined, {
		enabled: showEquipment && equipmentProp === undefined && isSignedIn
	})
	const equipment: Equipment[] =
		equipmentProp ?? exercisesQuery.data?.find(e => e.id === exerciseId)?.equipment.map(e => e.equipment) ?? []
	const guide = guideQuery.data
	const searchUrl = youtubeSearchUrl(exerciseName)

	const equipmentTags =
		showEquipment && equipment.length > 0 ? (
			<ul aria-label="Equipment" className="flex flex-wrap gap-1.5">
				{equipment.map(eq => (
					<li key={eq} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink text-xs">
						{formatEquipment(eq)}
					</li>
				))}
			</ul>
		) : null

	if (guideQuery.isLoading) {
		return (
			<div className="space-y-4">
				{equipmentTags}
				<div className="flex justify-center py-8">
					<Spinner />
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{equipmentTags}

			{guide && (
				<>
					<section className="rounded-md border border-edge bg-surface-1 px-3.5 py-3">
						<p className="text-ink-muted text-sm italic leading-relaxed">{guide.description}</p>
					</section>

					<section
						aria-label="Form cues"
						className="rounded-md border border-edge border-l-2 border-l-accent bg-surface-1 px-3.5 py-3"
					>
						<h3 className="mb-2.5 font-semibold text-accent text-xs uppercase tracking-wider">Form cues</h3>
						<ol className="space-y-2 text-ink text-sm leading-relaxed">
							{guide.cues.map((cue, i) => (
								<li key={cue} className="flex gap-3">
									<span className="mt-0.5 font-mono text-accent/70 text-xs tabular-nums">
										{i + 1}.
									</span>
									<span>{cue}</span>
								</li>
							))}
						</ol>
					</section>

					{guide.pitfalls && guide.pitfalls.length > 0 && (
						<section
							aria-label="Common pitfalls"
							className="rounded-md border border-edge border-l-2 border-l-destructive bg-surface-1 px-3.5 py-3"
						>
							<h3 className="mb-2.5 font-semibold text-destructive text-xs uppercase tracking-wider">
								Common pitfalls
							</h3>
							<ul className="space-y-1.5 text-ink-muted text-sm leading-relaxed">
								{guide.pitfalls.map(pitfall => (
									<li key={pitfall} className="flex gap-2">
										<span className="mt-0.5 text-destructive/70">✗</span>
										<span>{pitfall}</span>
									</li>
								))}
							</ul>
						</section>
					)}
				</>
			)}

			{!guide && (
				<div className="flex flex-col items-center gap-3 rounded-md border border-edge border-dashed bg-surface-1 px-4 py-8 text-center">
					<p className="text-ink-muted text-sm">No guide yet for this exercise.</p>
					<p className="text-ink-faint text-xs">Try YouTube for demonstrations and form breakdowns.</p>
				</div>
			)}

			<a
				href={searchUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm border border-edge bg-transparent px-5 font-medium text-ink text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
			>
				<ExternalLink className="size-4" />
				Watch on YouTube
			</a>
		</div>
	)
}
