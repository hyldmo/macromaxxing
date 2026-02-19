import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { createIDBPersister, UserProvider } from '~/lib'
import { createTRPCClient, trpc } from '~/lib/trpc'
import { router } from '~/router'
import '@mdxeditor/editor/style.css'
import '~/index.css'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

const ONE_DAY = 1000 * 60 * 60 * 24

function App() {
	const [queryClient] = useState(() => {
		const client = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: ONE_DAY,
					staleTime: 1000 * 60 * 5,
					networkMode: 'offlineFirst'
				},
				mutations: {
					networkMode: 'offlineFirst'
				}
			}
		})
		persistQueryClient({ queryClient: client, persister: createIDBPersister(), maxAge: ONE_DAY })
		return client
	})
	const [trpcClient] = useState(createTRPCClient)

	return (
		<ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/" appearance={{ baseTheme: dark }}>
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>
					<UserProvider>
						<RouterProvider router={router} />
					</UserProvider>
				</QueryClientProvider>
			</trpc.Provider>
		</ClerkProvider>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
