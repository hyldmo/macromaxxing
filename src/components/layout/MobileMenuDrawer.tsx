import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import { ChefHat, LogIn, Star, X } from 'lucide-react'
import { type FC, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn, FAVORITABLE_ROUTES, MAX_FAVORITES, useScrollLock } from '~/lib'

export interface MobileMenuDrawerProps {
	open: boolean
	onClose: () => void
	favorites: string[]
	isFavorite: (route: string) => boolean
	onToggleFavorite: (route: string) => void
}

export const MobileMenuDrawer: FC<MobileMenuDrawerProps> = ({
	open,
	onClose,
	favorites,
	isFavorite,
	onToggleFavorite
}) => {
	const location = useLocation()

	// Close on route change (e.g. when a row navigates).
	// biome-ignore lint/correctness/useExhaustiveDependencies: onClose intentionally omitted — dep on pathname only so the effect fires on navigation, not on every re-render
	useEffect(() => {
		if (open) onClose()
	}, [location.pathname])

	// Close on ESC.
	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null
	return (
		<DrawerBody
			onClose={onClose}
			favorites={favorites}
			isFavorite={isFavorite}
			onToggleFavorite={onToggleFavorite}
		/>
	)
}

const DrawerBody: FC<Omit<MobileMenuDrawerProps, 'open'>> = ({ onClose, isFavorite, onToggleFavorite }) => {
	useScrollLock()
	return (
		<div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
			<button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={onClose} />
			<div className="absolute top-0 right-0 flex h-full w-[85%] max-w-sm flex-col border-edge border-l bg-surface-1">
				<header className="flex items-center justify-between border-edge border-b px-4 py-3">
					<div className="flex items-center gap-2 font-semibold text-accent">
						<ChefHat className="size-5" />
						<span className="tracking-tight">macromaxxing</span>
					</div>
					<div className="flex items-center gap-2">
						<SignedIn>
							<UserButton />
						</SignedIn>
						<SignedOut>
							<SignInButton mode="modal">
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-ink-muted text-sm transition-colors hover:text-ink"
								>
									<LogIn className="size-4" />
									Sign in
								</button>
							</SignInButton>
						</SignedOut>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close menu"
							className="rounded-sm p-1.5 text-ink-muted transition-colors hover:text-ink"
						>
							<X className="size-5" />
						</button>
					</div>
				</header>

				<nav className="flex-1 overflow-y-auto py-2">
					<SignedIn>
						{FAVORITABLE_ROUTES.map(({ to, label, icon: Icon }) => {
							const starred = isFavorite(to)
							return (
								<div key={to} className="flex items-stretch">
									<NavLink
										to={to}
										className="flex flex-1 items-center gap-3 px-4 py-3 current:font-medium current:text-accent text-ink-muted transition-colors hover:text-ink"
									>
										<Icon className="size-5" />
										<span>{label}</span>
									</NavLink>
									<button
										type="button"
										onClick={() => onToggleFavorite(to)}
										aria-label={
											starred ? `Unpin ${label} from bottom bar` : `Pin ${label} to bottom bar`
										}
										aria-pressed={starred}
										className={cn(
											'flex w-12 items-center justify-center text-ink-faint transition-colors hover:text-ink',
											starred && 'text-accent'
										)}
									>
										<Star className={cn('size-5', starred && 'fill-current')} />
									</button>
								</div>
							)
						})}
						<p className="px-4 py-3 text-ink-faint text-xs">
							Pin up to {MAX_FAVORITES} to the bottom bar. Picking a 5th replaces the oldest.
						</p>
					</SignedIn>
					<SignedOut>
						{FAVORITABLE_ROUTES.filter(r => r.to === '/recipes' || r.to === '/ingredients').map(
							({ to, label, icon: Icon }) => (
								<NavLink
									key={to}
									to={to}
									className="flex items-center gap-3 px-4 py-3 current:font-medium current:text-accent text-ink-muted transition-colors hover:text-ink"
								>
									<Icon className="size-5" />
									<span>{label}</span>
								</NavLink>
							)
						)}
					</SignedOut>
				</nav>
			</div>
		</div>
	)
}
