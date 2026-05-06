import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'
import { QueryClientProvider } from '@tanstack/react-query'
import type { FC, ReactNode } from 'react'
import { Links, Meta, Scripts, ScrollRestoration } from 'react-router'
import { ErrorBoundary as AppErrorBoundary } from '~/components/ErrorBoundary'
import { RootLayout } from '~/components/layout/RootLayout'
import { UserProvider } from '~/lib'
import { queryClient, trpc, trpcClient } from '~/lib/trpc'
import '@mdxeditor/editor/style.css'
import '~/index.css'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

interface LayoutProps {
	children: ReactNode
}

export const Layout: FC<LayoutProps> = ({ children }) => {
	return (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta name="theme-color" content="#1f1d1b" />
				<Meta />
				<Links />
				<script src="/standalone-viewport.js" />
				<script src="/self-heal.js" />
				<link rel="icon" href="/favicon.ico" sizes="48x48" />
				<link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
				<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
				/>
				<title>Macromaxxing</title>
			</head>
			<body>
				<div id="root">
					<ClerkProvider
						publishableKey={CLERK_PUBLISHABLE_KEY}
						afterSignOutUrl="/"
						appearance={{ baseTheme: dark }}
					>
						<trpc.Provider client={trpcClient} queryClient={queryClient}>
							<QueryClientProvider client={queryClient}>
								<UserProvider>{children}</UserProvider>
							</QueryClientProvider>
						</trpc.Provider>
					</ClerkProvider>
				</div>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	)
}

export default function Root() {
	return <RootLayout />
}

export const HydrateFallback: FC = () => (
	<div className="flex min-h-screen items-center justify-center bg-surface-0">
		<div className="font-mono text-ink-muted text-sm">Loading…</div>
	</div>
)

export const ErrorBoundary: FC = () => <AppErrorBoundary />
