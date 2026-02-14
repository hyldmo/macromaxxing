import type { Recipe } from '@macromaxxing/db'
import { Sparkles } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'
import { Button, SaveButton } from '~/components/ui'
import { trpc } from '~/lib/trpc'

export interface GenerateInstructionsButtonProps {
	recipeId: Recipe['id']
	ingredients: Array<{ name: string; grams: number }>
	hasExisting: boolean
	onGenerated: (instructions: string) => void
}

export const GenerateInstructionsButton: FC<GenerateInstructionsButtonProps> = ({
	recipeId,
	ingredients,
	hasExisting,
	onGenerated
}) => {
	const [open, setOpen] = useState(false)
	const [preprompt, setPreprompt] = useState('')
	const popoverRef = useRef<HTMLDivElement>(null)
	const utils = trpc.useUtils()

	const mutation = trpc.ai.generateInstructions.useMutation({
		onSuccess: data => {
			onGenerated(data.instructions)
			utils.recipe.get.invalidate({ id: recipeId })
			setOpen(false)
			setPreprompt('')
		}
	})

	useEffect(() => {
		if (!open) return
		function handleClick(e: MouseEvent) {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClick)
		return () => document.removeEventListener('mousedown', handleClick)
	}, [open])

	if (ingredients.length === 0) return null

	return (
		<div className="relative">
			<Button
				variant="ghost"
				size="icon"
				className="size-8 shrink-0"
				onClick={() => setOpen(!open)}
				title="Generate instructions with AI"
			>
				<Sparkles className="size-4 text-current" />
			</Button>
			{open && (
				<div
					ref={popoverRef}
					className="absolute top-full right-0 z-10 mt-1 w-72 rounded-md border border-edge bg-surface-0 p-3 shadow-sm"
				>
					<div className="space-y-2">
						<textarea
							className="w-full resize-none rounded-md border border-edge bg-surface-1 px-2 py-1.5 text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
							rows={3}
							placeholder="Optional context (e.g. &quot;oven bake at 200°C&quot;, &quot;slow cooker&quot;)"
							value={preprompt}
							onChange={e => setPreprompt(e.target.value)}
						/>
						{hasExisting && (
							<p className="text-[11px] text-warning">This will replace existing instructions</p>
						)}
						<SaveButton
							className="w-full"
							size="sm"
							mutation={mutation}
							pendingText="Generating..."
							onClick={() =>
								mutation.mutate({ recipeId, ingredients, preprompt: preprompt || undefined })
							}
							rawError
						>
							Generate
						</SaveButton>
					</div>
				</div>
			)}
		</div>
	)
}
