import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { createTRPCClient, trpc } from '~/lib/trpc'
import { router } from '~/router'
import '~/index.css'

function App() {
	const [queryClient] = useState(() => new QueryClient())
	const [trpcClient] = useState(createTRPCClient)

	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</trpc.Provider>
	)
}

createRoot(document.getElementById('root')!).render(<App />)
