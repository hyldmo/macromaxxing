import type { Exercise, WorkoutSession } from '@macromaxxing/db'
import { X } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type NotesExercise, parseSessionNotes, serializeSessionNotes, useScrollLock } from '~/lib'
import { trpc } from '~/lib/trpc'

const DEBOUNCE_MS = 800

export interface SessionNotesModalProps {
	sessionId: WorkoutSession['id']
	initialNotes: string | null
	/** Session exercises in plan order — one note section each. */
	exercises: NotesExercise[]
	/** Exercise whose section should be focused on open (the one active in timer mode). */
	focusExerciseId?: Exercise['id']
	onClose: () => void
}

export const SessionNotesModal: FC<SessionNotesModalProps> = ({
	sessionId,
	initialNotes,
	exercises,
	focusExerciseId,
	onClose
}) => {
	const parsed = useMemo(
		() =>
			parseSessionNotes(
				initialNotes,
				exercises.map(e => e.name)
			),
		[initialNotes, exercises]
	)

	const [notes, setNotes] = useState<Record<Exercise['id'], string>>(() => {
		const record: Record<Exercise['id'], string> = {}
		for (const ex of exercises) record[ex.id] = parsed.byExerciseName.get(ex.name) ?? ''
		return record
	})
	const [general, setGeneral] = useState(parsed.general)

	const notesRef = useRef(notes)
	const generalRef = useRef(general)
	const savedRef = useRef(initialNotes ?? '')
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const textareas = useRef(new Map<Exercise['id'] | 'general', HTMLTextAreaElement>())
	const { mutate } = trpc.workout.updateSessionNotes.useMutation()
	useScrollLock()

	const flush = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
			timeoutRef.current = null
		}
		const serialized = serializeSessionNotes(
			exercises,
			new Map(exercises.map(ex => [ex.id, notesRef.current[ex.id] ?? ''])),
			generalRef.current
		)
		if (serialized === savedRef.current) return
		savedRef.current = serialized
		mutate({ id: sessionId, notes: serialized })
	}, [exercises, mutate, sessionId])

	const scheduleSave = useCallback(() => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(flush, DEBOUNCE_MS)
	}, [flush])

	const handleClose = useCallback(() => {
		flush()
		onClose()
	}, [flush, onClose])

	const handleExerciseChange = useCallback(
		(id: Exercise['id'], value: string) => {
			setNotes(prev => {
				const next = { ...prev, [id]: value }
				notesRef.current = next
				return next
			})
			scheduleSave()
		},
		[scheduleSave]
	)

	const handleGeneralChange = useCallback(
		(value: string) => {
			setGeneral(value)
			generalRef.current = value
			scheduleSave()
		},
		[scheduleSave]
	)

	useEffect(() => {
		const target = (focusExerciseId && textareas.current.get(focusExerciseId)) ?? textareas.current.get('general')
		target?.focus()
		target?.scrollIntoView({ block: 'center' })
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				handleClose()
			}
		}
		document.addEventListener('keydown', handler, true)
		return () => document.removeEventListener('keydown', handler, true)
	}, [focusExerciseId, handleClose])

	useEffect(() => {
		return () => flush()
	}, [flush])

	const titleId = 'session-notes-title'
	const textareaClass =
		'w-full resize-none rounded-sm border border-edge bg-surface-1 px-3 py-2 text-ink text-sm leading-relaxed [field-sizing:content] min-h-14 placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

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
						Notes
					</h2>
					<button
						type="button"
						onClick={handleClose}
						aria-label="Close notes"
						className="rounded-full p-1.5 text-ink-faint hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
					>
						<X className="size-5" />
					</button>
				</header>

				<div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
					{exercises.map(ex => (
						<label key={ex.id} className="flex flex-col gap-1.5">
							<span className="font-mono text-ink-faint text-xs uppercase tracking-wide">{ex.name}</span>
							<textarea
								ref={el => {
									if (el) textareas.current.set(ex.id, el)
									else textareas.current.delete(ex.id)
								}}
								value={notes[ex.id] ?? ''}
								onChange={e => handleExerciseChange(ex.id, e.target.value)}
								placeholder="Notes for this exercise…"
								className={textareaClass}
							/>
						</label>
					))}

					<label className="flex flex-col gap-1.5 border-edge border-t pt-4">
						<span className="font-mono text-ink-faint text-xs uppercase tracking-wide">General</span>
						<textarea
							ref={el => {
								if (el) textareas.current.set('general', el)
								else textareas.current.delete('general')
							}}
							value={general}
							onChange={e => handleGeneralChange(e.target.value)}
							placeholder="Anything about the whole session…"
							className={textareaClass}
						/>
					</label>
				</div>
			</div>
		</div>,
		document.body
	)
}
