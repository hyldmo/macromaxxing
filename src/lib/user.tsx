import { useAuth } from '@clerk/clerk-react'
import { createContext, type FC, type ReactNode, useContext } from 'react'
import { trpc } from './trpc'

interface User {
	id: string
	email: string
}

interface UserContextValue {
	user: User | null
	isSignedIn: boolean
	isLoading: boolean
}

const UserContext = createContext<UserContextValue>({ user: null, isSignedIn: false, isLoading: true })

export interface UserProviderProps {
	children: ReactNode
}

export const UserProvider: FC<UserProviderProps> = ({ children }) => {
	const { isSignedIn, isLoaded } = useAuth()
	const { data, isLoading } = trpc.user.me.useQuery(undefined, {
		retry: false,
		staleTime: 5 * 60 * 1000,
		enabled: isSignedIn === true
	})

	return (
		<UserContext.Provider
			value={{
				user: data ?? null,
				isSignedIn: isSignedIn === true,
				isLoading: !isLoaded || (isSignedIn === true && isLoading)
			}}
		>
			{children}
		</UserContext.Provider>
	)
}

export const useUser = () => useContext(UserContext)
