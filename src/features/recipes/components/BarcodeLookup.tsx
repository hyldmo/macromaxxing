import { ScanLine, Search, X } from 'lucide-react'
import { type FC, useCallback, useState } from 'react'
import { Button, Input, Spinner } from '~/components/ui'
import { isValidBarcode, lookupBarcode, type OFFProduct } from '~/lib'
import { BarcodeScanner } from './BarcodeScanner'

export interface BarcodeLookupProps {
	onProductFound: (product: OFFProduct) => void
}

type LookupState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'not-found' }
	| { status: 'error'; message: string }

export const BarcodeLookup: FC<BarcodeLookupProps> = ({ onProductFound }) => {
	const [expanded, setExpanded] = useState(false)
	const [scanning, setScanning] = useState(false)
	const [manualBarcode, setManualBarcode] = useState('')
	const [lookup, setLookup] = useState<LookupState>({ status: 'idle' })
	const [cameraError, setCameraError] = useState<string | null>(null)

	const doLookup = useCallback(
		async (barcode: string) => {
			setLookup({ status: 'loading' })
			setScanning(false)
			try {
				const result = await lookupBarcode(barcode)
				if (result.found) {
					onProductFound(result.product)
					setExpanded(false)
					setManualBarcode('')
					setLookup({ status: 'idle' })
				} else {
					setLookup({ status: 'not-found' })
				}
			} catch (err) {
				setLookup({ status: 'error', message: err instanceof Error ? err.message : 'Lookup failed' })
			}
		},
		[onProductFound]
	)

	const handleScan = useCallback(
		(barcode: string) => {
			doLookup(barcode)
		},
		[doLookup]
	)

	const handleCameraError = useCallback((msg: string) => {
		setCameraError(msg)
		setScanning(false)
	}, [])

	function handleManualSubmit() {
		const trimmed = manualBarcode.trim()
		if (!isValidBarcode(trimmed)) {
			setLookup({ status: 'error', message: 'Enter a valid barcode (8–13 digits)' })
			return
		}
		doLookup(trimmed)
	}

	function handleClose() {
		setExpanded(false)
		setScanning(false)
		setManualBarcode('')
		setLookup({ status: 'idle' })
		setCameraError(null)
	}

	if (!expanded) {
		return (
			<Button
				type="button"
				variant="outline"
				className="w-full"
				onClick={() => {
					setExpanded(true)
					setScanning(true)
				}}
			>
				<ScanLine className="size-4" />
				Scan barcode
			</Button>
		)
	}

	return (
		<div className="space-y-2">
			{scanning && !cameraError && <BarcodeScanner active onScan={handleScan} onError={handleCameraError} />}

			{cameraError && (
				<p className="rounded-sm bg-destructive/10 px-3 py-2 text-destructive text-xs">{cameraError}</p>
			)}

			<div className="flex gap-2">
				<Input
					placeholder="Barcode number..."
					value={manualBarcode}
					onChange={e => setManualBarcode(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault()
							handleManualSubmit()
						}
					}}
					inputMode="numeric"
					className="flex-1"
				/>
				<Button
					type="button"
					variant="outline"
					disabled={!manualBarcode.trim() || lookup.status === 'loading'}
					onClick={() => handleManualSubmit()}
				>
					{lookup.status === 'loading' ? (
						<Spinner className="size-4 text-current" />
					) : (
						<Search className="size-4" />
					)}
				</Button>
				<Button type="button" variant="ghost" size="icon" onClick={handleClose}>
					<X className="size-4" />
				</Button>
			</div>

			{lookup.status === 'not-found' && (
				<p className="rounded-sm bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-400">
					Product not found on Open Food Facts. Try entering details manually.
				</p>
			)}

			{lookup.status === 'error' && (
				<p className="rounded-sm bg-destructive/10 px-3 py-2 text-destructive text-xs">{lookup.message}</p>
			)}
		</div>
	)
}
