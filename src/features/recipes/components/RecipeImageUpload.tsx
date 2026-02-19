import type { Recipe } from '@macromaxxing/db'
import { Camera, Trash2, Upload } from 'lucide-react'
import { type FC, useRef, useState } from 'react'
import { Button, Spinner } from '~/components/ui'
import { cn } from '~/lib/cn'
import { getImageAttribution, getImageUrl, isExternalImage } from '~/lib/images'

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

	async function handleUpload(file: File) {
		setUploading(true)
		setError(null)
		try {
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
				<div className="group relative">
					<img
						src={getImageUrl(image)}
						alt=""
						className="h-48 w-full border border-edge bg-surface-0 object-cover"
						loading="lazy"
					/>
					{!readOnly && (
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
					'flex h-32 w-full flex-col items-center justify-center gap-2 border border-edge border-dashed bg-surface-0 transition-colors hover:border-accent/50 hover:bg-surface-1',
					uploading && 'pointer-events-none opacity-50'
				)}
				onClick={() => fileInputRef.current?.click()}
			>
				{uploading ? (
					<Spinner />
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
