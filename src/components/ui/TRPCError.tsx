import type { TRPCClientErrorLike } from '@trpc/client'
import { AlertTriangle } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '~/lib/cn'
import type { AppRouter } from '../../../workers/functions/lib/router'

export interface TRPCErrorProps {
	error: TRPCClientErrorLike<AppRouter> | null
	type?: 'error' | 'warning' | 'info'
	raw?: boolean
	className?: string
}

export const TRPCError: FC<TRPCErrorProps> = ({ error, type = 'error', raw, className }) => {
	if (!error) return null

	return (
		<div
			className={cn(
				'flex h-8 items-center gap-2 rounded-md px-3',
				{
					'bg-destructive/10': type === 'error',
					'bg-warning/10': type === 'warning',
					'bg-info/10': type === 'info'
				},
				className
			)}
		>
			<AlertTriangle
				className={cn('size-4 shrink-0', {
					'text-destructive': type === 'error',
					'text-warning': type === 'warning',
					'text-info': type === 'info'
				})}
			/>
			<span
				className={cn('text-sm', {
					'text-destructive': type === 'error',
					'text-warning': type === 'warning',
					'text-info': type === 'info'
				})}
			>
				{raw ? error.message : getFriendlyMessage(error)}
			</span>
		</div>
	)
}

const friendlyMessages: Record<string, string> = {
	ENCRYPTION_SECRET_NOT_CONFIGURED: 'AI lookup requires configuration. Go to Settings to add your API key.',
	UNAUTHORIZED: 'You need to be logged in to do this.',
	NOT_FOUND: 'The requested item was not found.'
	// INTERNAL_SERVER_ERROR: 'Something went wrong on the server. Please try again.'
}

function getFriendlyMessage(error: TRPCClientErrorLike<AppRouter>): ReactNode {
	const message = error.message

	// Check for known error patterns
	if (message.includes('ENCRYPTION_SECRET not configured')) {
		return friendlyMessages.ENCRYPTION_SECRET_NOT_CONFIGURED
	}
	if (message.includes('API key required for initial setup')) {
		return (
			<p>
				{message}
				<Link to="/settings">Go to Settings to configure your AI provider.</Link>
			</p>
		)
	}

	// Check by error code
	const code = error.data?.code
	if (code && code in friendlyMessages) {
		return friendlyMessages[code]
	}

	// Fallback to the original message, but clean it up
	return message.length > 100 ? `${message.slice(0, 100)}...` : message
}
