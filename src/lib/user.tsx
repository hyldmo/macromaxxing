import { createContext, type FC, type ReactNode, useContext } from 'react'
import { trpc } from './trpc'

interface User {
	id: string
	email: string
}

interface UserContextValue {
	user: User | null
	isLoading: boolean
}

const UserContext = createContext<UserContextValue>({ user: null, isLoading: true })

export interface UserProviderProps {
	children: ReactNode
}

export const UserProvider: FC<UserProviderProps> = ({ children }) => {
	const { data, isLoading } = trpc.user.me.useQuery(undefined, {
		retry: false,
		staleTime: 5 * 60 * 1000
	})

	return <UserContext.Provider value={{ user: data ?? null, isLoading }}>{children}</UserContext.Provider>
}

export const useUser = () => useContext(UserContext)

export const login = () => {
	// Cloudflare Access login - redirects to the access login page
	window.location.href = '/cdn-cgi/access/login'
}

export const logout = () => {
	// Cloudflare Access logout - redirects to the access logout endpoint
	// This clears the CF_Authorization cookie
	window.location.href = '/cdn-cgi/access/logout'
}
