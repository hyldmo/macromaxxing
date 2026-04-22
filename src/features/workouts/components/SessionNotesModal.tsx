import type { WorkoutSession } from '@macromaxxing/db'
import { X } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '~/lib'
import { trpc } from '~/lib/trpc'

const DEBOUNCE_MS = 800

export interface SessionNotesModalProps {
	sessionId: WorkoutSession['id']
	initialNotes: string | null
	onClose: () => void
}

export const SessionNotesModal: FC<SessionNotesModalProps> = ({ sessionId, initialNotes, onClose }) => {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const savedRef = useRef(initialNotes ?? '')
	const valueRef = useRef(initialNotes ?? '')
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [value, setValue] = useState(initialNotes ?? '')
	const mutation = trpc.workout.updateSessionNotes.useMutation()
	useScrollLock()

	const flush = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current)
			timeoutRef.current = null
		}
		if (valueRef.current === savedRef.current) return
		savedRef.current = valueRef.current
		mutation.mutate({ id: sessionId, notes: valueRef.current })
	}, [mutation, sessionId])

	const handleClose = useCallback(() => {
		flush()
		onClose()
	}, [flush, onClose])

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const next = e.target.value
			setValue(next)
			valueRef.current = next
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
			timeoutRef.current = setTimeout(flush, DEBOUNCE_MS)
		},
		[flush]
	)

	useEffect(() => {
		textareaRef.current?.focus()
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				handleClose()
			}
		}
		document.addEventListener('keydown', handler, true)
		return () => document.removeEventListener('keydown', handler, true)
	}, [handleClose])

	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current)
				if (valueRef.current !== savedRef.current) {
					mutation.mutate({ id: sessionId, notes: valueRef.current })
				}
			}
		}
	}, [mutation, sessionId])

	const titleId = 'session-notes-title'

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

				<div className="flex flex-1 flex-col px-4 py-4">
					<textarea
						ref={textareaRef}
						value={value}
						onChange={handleChange}
						placeholder="Jot anything down…"
						className="flex-1 resize-none rounded-sm border border-edge bg-surface-1 px-3 py-2 text-ink text-sm leading-relaxed placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
					/>
				</div>
			</div>
		</div>,
		document.body
	)
}
