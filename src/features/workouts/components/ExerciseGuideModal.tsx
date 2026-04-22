import type { Exercise } from '@macromaxxing/db'
import { ExternalLink, X } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '~/components/ui'
import { useScrollLock } from '~/lib'
import { trpc } from '~/lib/trpc'

const youtubeSearchUrl = (exerciseName: string): string =>
	`https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName} proper form`)}`

export interface ExerciseGuideModalProps {
	exerciseId: Exercise['id']
	exerciseName: string
	onClose: () => void
}

export const ExerciseGuideModal: FC<ExerciseGuideModalProps> = ({ exerciseId, exerciseName, onClose }) => {
	const closeBtnRef = useRef<HTMLButtonElement>(null)
	const guideQuery = trpc.workout.getGuide.useQuery({ exerciseId })
	useScrollLock()

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				onClose()
			}
		}
		document.addEventListener('keydown', handler, true)
		closeBtnRef.current?.focus()
		return () => document.removeEventListener('keydown', handler, true)
	}, [onClose])

	const searchUrl = youtubeSearchUrl(exerciseName)
	const titleId = 'exercise-guide-title'
	const guide = guideQuery.data

	return createPortal(
		<div
			className="fixed inset-0 z-70 flex flex-col overflow-hidden overscroll-contain bg-surface-0"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
		>
			<div className="mx-auto flex h-full w-full max-w-sm flex-col">
				<header className="flex items-center justify-between border-edge border-b px-4 py-3">
					<h2 id={titleId} className="font-semibold text-ink text-lg">
						{exerciseName}
					</h2>
					<button
						type="button"
						ref={closeBtnRef}
						onClick={onClose}
						aria-label="Close guide"
						className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
					>
						<X className="size-5" />
					</button>
				</header>

				<div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
					{guideQuery.isLoading && (
						<div className="flex justify-center py-8">
							<Spinner />
						</div>
					)}

					{!guideQuery.isLoading && guide && (
						<>
							<section className="rounded-md border border-edge bg-surface-1 px-3.5 py-3">
								<p className="text-ink-muted text-sm italic leading-relaxed">{guide.description}</p>
							</section>

							<section
								aria-label="Form cues"
								className="rounded-md border border-edge border-l-2 border-l-accent bg-surface-1 px-3.5 py-3"
							>
								<h3 className="mb-2.5 font-semibold text-accent text-xs uppercase tracking-wider">
									Form cues
								</h3>
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

					{!(guideQuery.isLoading || guide) && (
						<div className="flex flex-col items-center gap-3 rounded-md border border-edge border-dashed bg-surface-1 px-4 py-8 text-center">
							<p className="text-ink-muted text-sm">No guide yet for this exercise.</p>
							<p className="text-ink-faint text-xs">
								Try YouTube for demonstrations and form breakdowns.
							</p>
						</div>
					)}
				</div>

				<footer className="border-edge border-t px-4 py-3">
					<a
						href={searchUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm border border-edge bg-transparent px-5 font-medium text-ink text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
					>
						<ExternalLink className="size-4" />
						Watch on YouTube
					</a>
				</footer>
			</div>
		</div>,
		document.body
	)
}
