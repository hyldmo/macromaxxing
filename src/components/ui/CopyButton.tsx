import { Check, ClipboardCopy } from 'lucide-react'
import { type FC, useCallback, useState } from 'react'
import { Button, type ButtonProps } from './Button'

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick'> {
	getText: () => string
}

export const CopyButton: FC<CopyButtonProps> = ({ getText, variant = 'ghost', size = 'icon', className, ...props }) => {
	const [copied, setCopied] = useState(false)

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(getText())
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}, [getText])

	return (
		<Button variant={variant} size={size} className={className} onClick={handleCopy} {...props}>
			{copied ? <Check className="size-4 text-success" /> : <ClipboardCopy className="size-4" />}
		</Button>
	)
}
