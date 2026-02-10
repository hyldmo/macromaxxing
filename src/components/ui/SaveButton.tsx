import type { TRPCClientErrorLike } from '@trpc/client'
import type { LucideIcon } from 'lucide-react'
import { Check } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import type { AppRouter } from '../../../workers/functions/lib/router'
import { Button, type ButtonProps } from './Button'
import { Spinner } from './Spinner'
import { TRPCError } from './TRPCError'

export interface SaveButtonProps extends Omit<ButtonProps, 'children'> {
	mutation: {
		isPending: boolean
		isSuccess: boolean
		isError: boolean
		error: TRPCClientErrorLike<AppRouter> | null
	}
	icon?: LucideIcon
	pendingText?: ReactNode
	children?: ReactNode
	rawError?: boolean
}

export const SaveButton: FC<SaveButtonProps> = ({
	mutation,
	disabled,
	icon: Icon,
	pendingText = 'Saving...',
	children = 'Save',
	rawError = false,
	...buttonProps
}) => (
	<div className="flex items-center gap-2">
		<Button type="submit" disabled={disabled || mutation.isPending} {...buttonProps}>
			{mutation.isPending ? (
				<Spinner className="size-4 text-current" />
			) : Icon ? (
				<Icon className="size-4" />
			) : null}
			{mutation.isPending ? pendingText : children}
		</Button>
		{mutation.isPending ? null : mutation.isSuccess ? (
			<span className="flex items-center gap-1 text-sm text-success">
				<Check className="size-4" /> <span>Saved</span>
			</span>
		) : mutation.isError ? (
			<TRPCError error={mutation.error} raw={rawError} />
		) : null}
	</div>
)
