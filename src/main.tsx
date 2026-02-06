import { ClerkProvider } from '@clerk/clerk-react'
import { dark } from '@clerk/themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { createTRPCClient, trpc } from '~/lib/trpc'
import { UserProvider } from '~/lib/user'
import { router } from '~/router'
import '@mdxeditor/editor/style.css'
import '~/index.css'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

function App() {
	const [queryClient] = useState(() => new QueryClient())
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
