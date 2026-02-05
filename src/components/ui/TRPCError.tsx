import type { TRPCClientErrorLike } from '@trpc/client'
import { AlertTriangle } from 'lucide-react'
import type { FC } from 'react'
import { cn } from '~/lib/cn'
import type { AppRouter } from '../../../functions/lib/router'

export interface TRPCErrorProps {
	error: TRPCClientErrorLike<AppRouter> | null
	className?: string
}

const friendlyMessages: Record<string, string> = {
	ENCRYPTION_SECRET_NOT_CONFIGURED: 'AI lookup requires configuration. Go to Settings to add your API key.',
	UNAUTHORIZED: 'You need to be logged in to do this.',
	NOT_FOUND: 'The requested item was not found.',
	INTERNAL_SERVER_ERROR: 'Something went wrong on the server. Please try again.'
}

function getFriendlyMessage(error: TRPCClientErrorLike<AppRouter>): string {
	const message = error.message

	// Check for known error patterns
	if (message.includes('ENCRYPTION_SECRET not configured')) {
		return friendlyMessages.ENCRYPTION_SECRET_NOT_CONFIGURED
	}
	if (message.includes('API key')) {
		return 'AI lookup requires an API key. Go to Settings to configure your AI provider.'
	}

	// Check by error code
	const code = error.data?.code
	if (code && code in friendlyMessages) {
		return friendlyMessages[code]
	}

	// Fallback to the original message, but clean it up
	return message.length > 100 ? `${message.slice(0, 100)}...` : message
}

export const TRPCError: FC<TRPCErrorProps> = ({ error, className = '' }) => {
	if (!error) return null

	return (
		<div className={cn('flex items-center gap-2 rounded-[--radius-md] bg-destructive/10 px-3 py-1', className)}>
			<AlertTriangle className="size-4 shrink-0 text-destructive" />
			<span className="text-destructive text-sm">{getFriendlyMessage(error)}</span>
		</div>
	)
}
