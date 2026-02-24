import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { type FC, useEffect, useId, useRef, useState } from 'react'
import { Spinner } from '~/components/ui'
import { cn } from '~/lib'

export interface BarcodeScannerProps {
	onScan: (barcode: string) => void
	onError?: (error: string) => void
	active: boolean
}

const FORMATS = [
	Html5QrcodeSupportedFormats.EAN_13,
	Html5QrcodeSupportedFormats.EAN_8,
	Html5QrcodeSupportedFormats.UPC_A,
	Html5QrcodeSupportedFormats.UPC_E
]

export const BarcodeScanner: FC<BarcodeScannerProps> = ({ onScan, onError, active }) => {
	const id = useId().replace(/:/g, '')
	const elementId = `barcode-reader-${id}`
	const scannerRef = useRef<Html5Qrcode | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		if (!active) return

		let cancelled = false
		const scanner = new Html5Qrcode(elementId, { formatsToSupport: FORMATS, verbose: false })
		scannerRef.current = scanner

		scanner
			.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 120 }, aspectRatio: 1.5 },
				decodedText => {
					if (!cancelled) {
						onScan(decodedText)
					}
				},
				() => {
					// scan failure per-frame — ignore silently
				}
			)
			.then(() => {
				if (!cancelled) setLoading(false)
			})
			.catch((err: Error) => {
				if (!cancelled) {
					setLoading(false)
					const msg = err.message?.toLowerCase() ?? ''
					if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
						onError?.('Camera access denied. You can type the barcode number instead.')
					} else if (
						msg.includes('not found') ||
						msg.includes('no camera') ||
						msg.includes('requested device not found')
					) {
						onError?.('No camera found.')
					} else {
						onError?.(err.message || 'Could not start camera')
					}
				}
			})

		return () => {
			cancelled = true
			scanner.isScanning &&
				scanner.stop().catch(() => {
					// ignore cleanup errors
				})
		}
	}, [active, elementId, onScan, onError])

	return (
		<div className="relative overflow-hidden rounded-sm border border-edge bg-surface-0">
			<div id={elementId} className={cn('h-48 [&>img]:hidden [&_video]:object-cover', loading && 'invisible')} />
			{loading && (
				<div className="absolute inset-0 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			)}
		</div>
	)
}
