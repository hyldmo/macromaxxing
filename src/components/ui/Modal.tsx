import type { FC } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '~/lib/cn'

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
	onClose?: () => void
}

export const Modal: FC<ModalProps> = ({ children, onClose, className, ...props }) =>
	createPortal(
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close handled by consumers
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
			aria-modal="true"
			onClick={onClose}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation for modal */}
			<div
				role="document"
				className={cn('rounded-[--radius-md] border border-edge bg-surface-0', className)}
				onClick={e => e.stopPropagation()}
				{...props}
			>
				{children}
			</div>
		</div>,
		document.body
	)
