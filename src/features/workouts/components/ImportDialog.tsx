import type { TypeIDString } from '@macromaxxing/db'
import { Upload, X } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import { Button } from '~/components/ui/Button'
import { Spinner } from '~/components/ui/Spinner'
import { Textarea } from '~/components/ui/Textarea'
import { TRPCError } from '~/components/ui/TRPCError'
import { trpc } from '~/lib/trpc'

export interface ImportDialogProps {
	open: boolean
	onClose: () => void
	/** Import as workout templates (default) or as sets into a session */
	mode?: 'templates' | 'sets'
	sessionId?: TypeIDString<'wks'>
	onImported?: () => void
}

interface PreviewRow {
	type: 'session' | 'exercise'
	label: string
	reps?: number
	weight?: string
	sets?: number
}

function parsePreview(text: string): { rows: PreviewRow[]; setsPerExercise: number; totalSets: number } {
	const lines = text
		.split('\n')
		.map(l => l.trim())
		.filter(Boolean)
	if (lines.length === 0) return { rows: [], setsPerExercise: 1, totalSets: 0 }

	const isSpreadsheet = /\breps\b/i.test(lines[0]) && /\bweight/i.test(lines[0])
	let setsPerExercise = 1
	if (isSpreadsheet) {
		const m = lines[0].match(/(\d+)\s*sets/i)
		if (m) setsPerExercise = Number.parseInt(m[1], 10)
	}

	const rows: PreviewRow[] = []
	const start = isSpreadsheet ? 1 : 0
	let exerciseCount = 0

	for (let i = start; i < lines.length; i++) {
		const line = lines[i]
		const parts = line.includes('\t') ? line.split('\t') : line.split(',')
		if (parts.length < 2) continue

		const col0 = parts[0].trim()

		if (isSpreadsheet && /^session\s+\d+/i.test(col0)) {
			const focus = parts[2]?.trim() || parts[1]?.trim() || ''
			rows.push({ type: 'session', label: `${col0}${focus ? ` — ${focus}` : ''}` })
			continue
		}

		if (isSpreadsheet) {
			if (!col0) continue
			const repsStr = parts[1]?.trim() ?? ''
			const reps = Number.parseInt(repsStr, 10)
			if (Number.isNaN(reps)) continue
			const weightRaw = (parts[2] ?? '').trim()
			const weight = weightRaw || 'BW'
			rows.push({ type: 'exercise', label: col0, reps, weight, sets: setsPerExercise })
			exerciseCount++
		} else {
			if (parts.length < 3) continue
			const weight = parts[1]?.trim()
			const reps = Number.parseInt(parts[2]?.trim(), 10)
			if (!col0 || Number.isNaN(reps)) continue
			rows.push({ type: 'exercise', label: col0, reps, weight })
			exerciseCount++
		}
	}

	return { rows, setsPerExercise, totalSets: exerciseCount * setsPerExercise }
}

export const ImportDialog: FC<ImportDialogProps> = ({ open, onClose, mode = 'templates', sessionId, onImported }) => {
	const [text, setText] = useState('')
	const utils = trpc.useUtils()

	const importWorkouts = trpc.workout.importWorkouts.useMutation({
		onSuccess: () => {
			utils.workout.listWorkouts.invalidate()
			utils.workout.listExercises.invalidate()
			onImported?.()
			setText('')
			onClose()
		}
	})

	const importSets = trpc.workout.importSets.useMutation({
		onSuccess: () => {
			utils.workout.listSessions.invalidate()
			utils.workout.listExercises.invalidate()
			if (sessionId) utils.workout.getSession.invalidate({ id: sessionId })
			onImported?.()
			setText('')
			onClose()
		}
	})

	const mutation = mode === 'templates' ? importWorkouts : importSets
	const preview = useMemo(() => parsePreview(text), [text])

	if (!open) return null

	function handleImport() {
		if (mode === 'templates') {
			importWorkouts.mutate({ text })
		} else {
			importSets.mutate({ sessionId, text })
		}
	}

	const exerciseCount = preview.rows.filter(r => r.type === 'exercise').length
	const buttonLabel = mode === 'templates' ? `Import ${exerciseCount} exercises` : `Import ${preview.totalSets} sets`

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="mx-4 w-full max-w-lg rounded-[--radius-md] border border-edge bg-surface-1 p-4">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="font-medium text-ink text-sm">
						{mode === 'templates' ? 'Import Workouts' : 'Import Workout Data'}
					</h3>
					<Button variant="ghost" size="icon" onClick={onClose}>
						<X className="size-4" />
					</Button>
				</div>

				<Textarea
					rows={8}
					placeholder={
						'Paste spreadsheet or CSV data:\n\nExercise\tReps (3 sets)\tWeights\nSession 1\tGym\tPush\nBench Press\t8\t80 kg'
					}
					value={text}
					onChange={e => setText(e.target.value)}
					className="mb-3 font-mono text-xs"
				/>

				{preview.rows.length > 0 && (
					<div className="mb-3 max-h-48 overflow-auto rounded-[--radius-sm] border border-edge bg-surface-0 p-2">
						<div className="space-y-0.5">
							{preview.rows.map(row =>
								row.type === 'session' ? (
									<div
										key={row.label}
										className="mt-1 border-edge border-b pb-1 font-medium text-accent text-xs first:mt-0"
									>
										{row.label}
									</div>
								) : (
									<div key={row.label} className="flex gap-3 font-mono text-xs tabular-nums">
										<span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
										<span className="w-16 text-right text-ink-muted">{row.weight}</span>
										<span className="w-10 text-right text-ink-muted">×{row.reps}</span>
										{row.sets && row.sets > 1 && (
											<span className="w-12 text-right text-ink-faint">{row.sets} sets</span>
										)}
									</div>
								)
							)}
						</div>
						<div className="mt-1 text-[10px] text-ink-faint">
							{preview.totalSets} total sets
							{preview.setsPerExercise > 1 && ` (${preview.setsPerExercise} per exercise)`}
						</div>
					</div>
				)}

				{mutation.isError && <TRPCError error={mutation.error} className="mb-3" />}

				<div className="flex gap-2">
					<Button onClick={handleImport} disabled={exerciseCount === 0 || mutation.isPending}>
						{mutation.isPending ? (
							<>
								<Spinner className="size-4" />
								Importing...
							</>
						) : (
							<>
								<Upload className="size-4" />
								{buttonLabel}
							</>
						)}
					</Button>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	)
}
