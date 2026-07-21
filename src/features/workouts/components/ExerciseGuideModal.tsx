import type { Equipment, Exercise } from '@macromaxxing/db'
import { X } from 'lucide-react'
import { type FC, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '~/lib'
import { ExerciseGuideContent } from './ExerciseGuideContent'

export interface ExerciseGuideModalProps {
	exerciseId: Exercise['id']
	exerciseName: string
	/** Optional override; otherwise looked up from listExercises when signed in. */
	equipment?: Equipment[]
	onClose: () => void
}

export const ExerciseGuideModal: FC<ExerciseGuideModalProps> = ({ exerciseId, exerciseName, equipment, onClose }) => {
	const closeBtnRef = useRef<HTMLButtonElement>(null)
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

	const titleId = 'exercise-guide-title'

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

				<div className="flex-1 overflow-y-auto px-4 py-5">
					<ExerciseGuideContent exerciseId={exerciseId} exerciseName={exerciseName} equipment={equipment} />
				</div>
			</div>
		</div>,
		document.body
	)
}
