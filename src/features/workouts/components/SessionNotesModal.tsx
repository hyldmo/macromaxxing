import type { Exercise, WorkoutExercise, WorkoutSession } from '@macromaxxing/db'
import { X } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '~/lib'
import { trpc } from '~/lib/trpc'

const DEBOUNCE_MS = 800

/** A template exercise whose per-exercise note (workoutExercises.note) is editable in the notepad. */
export interface NotesExercise {
	exerciseId: Exercise['id']
	workoutExerciseId: WorkoutExercise['id']
	name: string
	note: string
}

export interface SessionNotesModalProps {
	sessionId: WorkoutSession['id']
	/** The whole-session note (workoutSessions.notes). */
	initialNotes: string | null
	/** Session template exercises in plan order — one note section each. */
	exercises: NotesExercise[]
	/** Exercise whose section should be focused on open (the one active in timer mode). */
	focusExerciseId?: Exercise['id']
	onClose: () => void
}

const SESSION_KEY = 'session'

export const SessionNotesModal: FC<SessionNotesModalProps> = ({
	sessionId,
	initialNotes,
	exercises,
	focusExerciseId,
	onClose
}) => {
	const [notes, setNotes] = useState<Record<Exercise['id'], string>>(() => {
		const record: Record<Exercise['id'], string> = {}
		for (const ex of exercises) record[ex.exerciseId] = ex.note
		return record
	})
	const [sessionNotes, setSessionNotes] = useState(initialNotes ?? '')

	// Latest values + last-saved snapshot per field, so per-field debounced flushes
	// only fire when that field actually changed.
	const valuesRef = useRef<Record<string, string>>({
		[SESSION_KEY]: initialNotes ?? '',
		...Object.fromEntries(exercises.map(ex => [ex.workoutExerciseId, ex.note]))
	})
	const savedRef = useRef<Record<string, string>>({ ...valuesRef.current })
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	const textareas = useRef(new Map<Exercise['id'] | typeof SESSION_KEY, HTMLTextAreaElement>())

	const utils = trpc.useUtils()
	const updateExerciseNote = trpc.workout.updateExerciseNote.useMutation({
		onSuccess: () => utils.workout.getSession.invalidate({ id: sessionId })
	})
	const updateSessionNotes = trpc.workout.updateSessionNotes.useMutation()
	useScrollLock()

	const flush = useCallback(
		(key: string) => {
			const timer = timers.current.get(key)
			if (timer) {
				clearTimeout(timer)
				timers.current.delete(key)
			}
			const value = valuesRef.current[key] ?? ''
			if (savedRef.current[key] === value) return
			savedRef.current[key] = value
			if (key === SESSION_KEY) updateSessionNotes.mutate({ id: sessionId, notes: value })
			else updateExerciseNote.mutate({ id: key as WorkoutExercise['id'], note: value })
		},
		[sessionId, updateExerciseNote, updateSessionNotes]
	)

	const scheduleSave = useCallback(
		(key: string) => {
			const existing = timers.current.get(key)
			if (existing) clearTimeout(existing)
			timers.current.set(
				key,
				setTimeout(() => flush(key), DEBOUNCE_MS)
			)
		},
		[flush]
	)

	const flushAll = useCallback(() => {
		for (const key of [...timers.current.keys()]) flush(key)
	}, [flush])

	const handleClose = useCallback(() => {
		flushAll()
		onClose()
	}, [flushAll, onClose])

	const handleExerciseChange = useCallback(
		(ex: NotesExercise, value: string) => {
			setNotes(prev => ({ ...prev, [ex.exerciseId]: value }))
			valuesRef.current[ex.workoutExerciseId] = value
			scheduleSave(ex.workoutExerciseId)
		},
		[scheduleSave]
	)

	const handleSessionChange = useCallback(
		(value: string) => {
			setSessionNotes(value)
			valuesRef.current[SESSION_KEY] = value
			scheduleSave(SESSION_KEY)
		},
		[scheduleSave]
	)

	useEffect(() => {
		const target = (focusExerciseId && textareas.current.get(focusExerciseId)) ?? textareas.current.get(SESSION_KEY)
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

	// Flush any pending edits on unmount (e.g. closing via the timer overlay).
	useEffect(() => () => flushAll(), [flushAll])

	const titleId = 'session-notes-title'
	const baseTextareaClass =
		'w-full resize-none rounded-sm border border-edge bg-surface-1 px-3 py-2 text-ink text-sm leading-relaxed placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'
	// Exercise notes auto-size from a single line; session notes flex to fill the remaining height.
	const exerciseTextareaClass = `${baseTextareaClass} [field-sizing:content]`
	const sessionTextareaClass = `${baseTextareaClass} h-full min-h-24`

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
						<label key={ex.exerciseId} className="flex flex-col gap-1.5">
							<span className="font-mono text-ink-faint text-xs uppercase tracking-wide">{ex.name}</span>
							<textarea
								ref={el => {
									if (el) textareas.current.set(ex.exerciseId, el)
									else textareas.current.delete(ex.exerciseId)
								}}
								value={notes[ex.exerciseId] ?? ''}
								onChange={e => handleExerciseChange(ex, e.target.value)}
								placeholder="Notes for this exercise…"
								rows={1}
								className={exerciseTextareaClass}
							/>
						</label>
					))}

					<label className="flex min-h-0 flex-1 flex-col gap-1.5">
						<span className="font-mono text-ink-faint text-xs uppercase tracking-wide">Session notes</span>
						<textarea
							ref={el => {
								if (el) textareas.current.set(SESSION_KEY, el)
								else textareas.current.delete(SESSION_KEY)
							}}
							value={sessionNotes}
							onChange={e => handleSessionChange(e.target.value)}
							placeholder="Anything about the whole session…"
							className={sessionTextareaClass}
						/>
					</label>
				</div>
			</div>
		</div>,
		document.body
	)
}
