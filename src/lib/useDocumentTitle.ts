import { useEffect } from 'react'

const SUFFIX = 'Macromaxxing'

export function useDocumentTitle(title?: string) {
	useEffect(() => {
		document.title = title ? `${title} — ${SUFFIX}` : SUFFIX
	}, [title])
}
