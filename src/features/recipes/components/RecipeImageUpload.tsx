import type { Recipe } from '@macromaxxing/db'
import { Camera, Trash2, Upload } from 'lucide-react'
import { type FC, useRef, useState } from 'react'
import { Button, Spinner } from '~/components/ui'
import { cn, getImageAttribution, getImageUrl, isExternalImage } from '~/lib'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_DIMENSION = 2048

function resizeImage(file: File): Promise<File> {
	return new Promise((resolve, reject) => {
		if (file.size <= MAX_FILE_SIZE) return resolve(file)

		const img = new Image()
		const url = URL.createObjectURL(file)
		img.onload = () => {
			URL.revokeObjectURL(url)
			const canvas = document.createElement('canvas')
			let { width, height } = img
			if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
				const scale = MAX_DIMENSION / Math.max(width, height)
				width = Math.round(width * scale)
				height = Math.round(height * scale)
			}
			canvas.width = width
			canvas.height = height
			const ctx = canvas.getContext('2d')!
			ctx.drawImage(img, 0, 0, width, height)

			let quality = 0.85
			const tryCompress = () => {
				canvas.toBlob(
					blob => {
						if (!blob) return reject(new Error('Failed to compress image'))
						if (blob.size <= MAX_FILE_SIZE || quality <= 0.3) {
							resolve(new File([blob], file.name, { type: 'image/jpeg' }))
						} else {
							quality -= 0.15
							tryCompress()
						}
					},
					'image/jpeg',
					quality
				)
			}
			tryCompress()
		}
		img.onerror = () => {
			URL.revokeObjectURL(url)
			reject(new Error('Failed to load image'))
		}
		img.src = url
	})
}

export interface RecipeImageUploadProps {
	recipeId: Recipe['id']
	image: Recipe['image']
	onImageChange: () => void
	readOnly?: boolean
}

export const RecipeImageUpload: FC<RecipeImageUploadProps> = ({ recipeId, image, onImageChange, readOnly }) => {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [dragging, setDragging] = useState(false)
	const dragCounter = useRef(0)

	function handleDragEnter(e: React.DragEvent) {
		e.preventDefault()
		dragCounter.current++
		if (e.dataTransfer.types.includes('Files')) setDragging(true)
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault()
		dragCounter.current--
		if (dragCounter.current === 0) setDragging(false)
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault()
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		dragCounter.current = 0
		setDragging(false)
		const file = e.dataTransfer.files[0]
		if (file?.type.startsWith('image/')) handleUpload(file)
		else setError('Please drop an image file')
	}

	const dropHandlers = readOnly
		? {}
		: { onDragEnter: handleDragEnter, onDragLeave: handleDragLeave, onDragOver: handleDragOver, onDrop: handleDrop }

	async function handleUpload(rawFile: File) {
		setUploading(true)
		setError(null)
		try {
			const file = await resizeImage(rawFile)
			const formData = new FormData()
			formData.append('image', file)
			const res = await fetch(`/api/recipes/${recipeId}/image`, {
				method: 'POST',
				body: formData,
				credentials: 'include'
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({ error: 'Upload failed' }))
				throw new Error((data as { error?: string }).error ?? 'Upload failed')
			}
			onImageChange()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Upload failed')
		} finally {
			setUploading(false)
		}
	}

	async function handleDelete() {
		setUploading(true)
		setError(null)
		try {
			const res = await fetch(`/api/recipes/${recipeId}/image`, {
				method: 'DELETE',
				credentials: 'include'
			})
			if (!res.ok) throw new Error('Delete failed')
			onImageChange()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Delete failed')
		} finally {
			setUploading(false)
		}
	}

	function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (file) handleUpload(file)
		e.target.value = ''
	}

	if (image) {
		return (
			<div className="space-y-1">
				<div className={cn('group relative', dragging && 'ring-2 ring-accent')} {...dropHandlers}>
					<img
						src={getImageUrl(image)}
						alt=""
						className="h-48 w-full border border-edge bg-surface-0 object-cover"
						loading="lazy"
					/>
					{dragging ? (
						<div className="absolute inset-0 flex items-center justify-center bg-black/50">
							<span className="text-sm text-white">Drop to replace</span>
						</div>
					) : (
						!readOnly && (
							<div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
								{uploading ? (
									<Spinner className="text-white" />
								) : (
									<>
										<Button
											variant="outline"
											size="sm"
											className="border-white/30 text-white hover:bg-white/20"
											onClick={() => fileInputRef.current?.click()}
										>
											<Upload className="size-3.5" />
											Change
										</Button>
										<Button
											variant="outline"
											size="sm"
											className="border-white/30 text-white hover:bg-white/20"
											onClick={handleDelete}
										>
											<Trash2 className="size-3.5" />
											Remove
										</Button>
									</>
								)}
							</div>
						)
					)}
				</div>
				{isExternalImage(image) && <p className="text-ink-faint text-xs">from {getImageAttribution(image)}</p>}
				{error && <p className="text-destructive text-xs">{error}</p>}
				<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
			</div>
		)
	}

	if (readOnly) return null

	return (
		<div className="space-y-1">
			<button
				type="button"
				className={cn(
					'flex h-32 w-full flex-col items-center justify-center gap-2 border border-dashed bg-surface-0 transition-colors',
					dragging ? 'border-accent bg-surface-1' : 'border-edge hover:border-accent/50 hover:bg-surface-1',
					uploading && 'pointer-events-none opacity-50'
				)}
				onClick={() => fileInputRef.current?.click()}
				{...dropHandlers}
			>
				{uploading ? (
					<Spinner />
				) : dragging ? (
					<>
						<Upload className="size-6 text-accent" />
						<span className="text-accent text-xs">Drop image here</span>
					</>
				) : (
					<>
						<Camera className="size-6 text-ink-faint" />
						<span className="text-ink-muted text-xs">Add photo</span>
					</>
				)}
			</button>
			{error && <p className="text-destructive text-xs">{error}</p>}
			<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
		</div>
	)
}
