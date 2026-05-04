import type { TypeIDString } from '@macromaxxing/db'
import type { FC } from 'react'

interface ProgramCyclePreviewProps {
	items: { id: TypeIDString<'wkt'>; name: string }[]
}

export const ProgramCyclePreview: FC<ProgramCyclePreviewProps> = ({ items }) => {
	if (items.length === 0) {
		return <div className="text-ink-faint text-sm italic">Add workouts to preview the cycle.</div>
	}
	return (
		<ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-ink-muted text-xs tabular-nums">
			{items.map((item, i) => (
				<li key={item.id} className="flex items-center gap-2">
					<span className="text-ink-faint">{i + 1}.</span>
					<span className="text-ink">{item.name}</span>
					{i < items.length - 1 && <span className="text-ink-faint">→</span>}
				</li>
			))}
			{items.length > 1 && <li className="text-ink-faint italic">→ wraps to 1</li>}
		</ol>
	)
}
