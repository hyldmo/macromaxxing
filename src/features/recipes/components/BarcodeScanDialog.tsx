import { ScanLine, X } from 'lucide-react'
import { type FC, useEffect } from 'react'
import { Button, Modal } from '~/components/ui'
import type { OFFProduct } from '~/lib'
import { BarcodeLookup } from './BarcodeLookup'

export interface BarcodeScanDialogProps {
	open: boolean
	onClose: () => void
	onProductFound: (product: OFFProduct) => void
}

export const BarcodeScanDialog: FC<BarcodeScanDialogProps> = ({ open, onClose, onProductFound }) => {
	// Close on Escape
	useEffect(() => {
		if (!open) return
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [open, onClose])

	if (!open) return null

	return (
		<Modal onClose={onClose} className="w-full max-w-sm">
			<div className="flex items-center justify-between border-edge border-b px-4 py-3">
				<h2 className="flex items-center gap-2 font-semibold text-ink">
					<ScanLine className="size-4" />
					Scan Barcode
				</h2>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="size-4" />
				</Button>
			</div>

			<div className="p-4">
				<BarcodeLookup active={open} onProductFound={onProductFound} onClose={onClose} />
			</div>
		</Modal>
	)
}
