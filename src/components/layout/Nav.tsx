import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/clerk-react'
import {
	BarChart3,
	CalendarDays,
	ChefHat,
	CookingPot,
	Dumbbell,
	LogIn,
	type LucideIcon,
	Menu,
	Settings,
	UtensilsCrossed
} from 'lucide-react'
import { type FC, type HTMLAttributes, useCallback, useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { Button } from '~/components/ui/Button'
import { OfflineIndicator } from '~/components/ui/OfflineIndicator'
import { RestTimer } from '~/features/workouts/components/RestTimer'
import { useWorkoutSessionStore } from '~/features/workouts/store'
import { cn, FAVORITABLE_ROUTES, useBottomNavFavorites } from '~/lib'
import { MobileMenuDrawer } from './MobileMenuDrawer'

const publicLinks = [
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed }
] satisfies Link[]

const desktopAuthLinks = [
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell },
	{ to: '/analytics', label: 'Analytics', icon: BarChart3 }
] satisfies Link[]

export interface Link {
	to: string
	label: string
	icon: LucideIcon
	end?: boolean
}

export function Nav() {
	const timerActive = useWorkoutSessionStore(s => s.sessionStartedAt !== null)
	const { favorites, isFavorite, toggle } = useBottomNavFavorites()
	const [menuOpen, setMenuOpen] = useState(false)
	const closeMenu = useCallback(() => setMenuOpen(false), [])

	// Close menu when a workout timer starts so the RestTimer isn't covered by an open drawer.
	useEffect(() => {
		if (timerActive) closeMenu()
	}, [timerActive, closeMenu])

	// Bottom bar = canonical order filtered by favorites.
	const mobileFavLinks: Link[] = FAVORITABLE_ROUTES.filter(r => favorites.includes(r.to)).map(r => ({
		to: r.to,
		label: r.label,
		icon: r.icon
	}))

	return (
		<>
			{/* Top nav (desktop full, mobile collapsed to brand + status + hamburger) */}
			<nav className="sticky top-0 z-50 border-edge border-b bg-surface-1">
				<div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
					<NavLink to="/" className="flex items-center gap-2 font-semibold text-accent">
						<ChefHat className="size-5" />
						<span className="tracking-tight">macromaxxing</span>
					</NavLink>
					<div className="hidden flex-1 md:flex">
						{publicLinks.map(props => (
							<WebLink key={props.to} {...props} />
						))}
						<SignedIn>
							{desktopAuthLinks.map(props => (
								<WebLink key={props.to} {...props} />
							))}
						</SignedIn>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<OfflineIndicator />
						<RestTimer />
						{/* Desktop-only: settings + avatar inline. */}
						<div className="hidden items-center gap-2 md:flex">
							<SignedIn>
								<WebLink to="/settings" icon={Settings} />
								<UserButton />
							</SignedIn>
							<SignedOut>
								<SignUpButton mode="modal">
									<Button>Sign up</Button>
								</SignUpButton>
								<SignInButton mode="modal">
									<WebLink icon={LogIn} label="Sign in" />
								</SignInButton>
							</SignedOut>
						</div>
						{/* Mobile-only hamburger. Hidden during active workout timer to keep RestTimer focused. */}
						<SignedIn>
							<button
								type="button"
								onClick={() => setMenuOpen(true)}
								aria-label="Open menu"
								aria-expanded={menuOpen}
								aria-controls="mobile-menu-drawer"
								className={cn(
									'rounded-sm p-1.5 text-ink-muted transition-colors hover:text-ink md:hidden',
									timerActive && 'hidden'
								)}
							>
								<Menu className="size-5" />
							</button>
						</SignedIn>
						<SignedOut>
							<SignUpButton mode="modal">
								<Button className="md:hidden">Sign up</Button>
							</SignUpButton>
							<SignInButton mode="modal">
								<button
									type="button"
									aria-label="Sign in"
									className="rounded-sm p-1.5 text-ink-muted transition-colors hover:text-ink md:hidden"
								>
									<LogIn className="size-5" />
								</button>
							</SignInButton>
						</SignedOut>
					</div>
				</div>
			</nav>

			{/* Mobile bottom tab bar */}
			<nav className="fixed right-0 bottom-0 left-0 z-50 border-edge border-t bg-surface-1 md:hidden">
				<div className="grid auto-cols-fr grid-flow-col justify-center px-3 2xs:py-1">
					<SignedIn>
						<AppLinks links={mobileFavLinks} />
					</SignedIn>
					<SignedOut>
						<AppLinks links={publicLinks} />
						<SignInButton mode="modal">
							<AppLink icon={LogIn} label="Sign in" />
						</SignInButton>
					</SignedOut>
				</div>
			</nav>

			<MobileMenuDrawer open={menuOpen} onClose={closeMenu} isFavorite={isFavorite} onToggleFavorite={toggle} />
		</>
	)
}

interface LinkProps {
	className?: string
	to?: string | (() => void)
	label?: string
	icon: LucideIcon
	end?: boolean
}

const WebLink: FC<LinkProps> = ({ to, label, icon: Icon, className, end, ...rest }) => {
	const Elem =
		typeof to === 'string'
			? (props: HTMLAttributes<HTMLAnchorElement>) => <NavLink to={to} end={end} {...props} />
			: (props: HTMLAttributes<HTMLButtonElement>) => <button type="button" onClick={to} {...props} />
	return (
		<Elem
			{...rest}
			className={cn(
				'group flex items-center gap-1.5 rounded-sm px-3 py-1.5 current:font-medium current:text-accent text-ink-muted text-sm transition-colors hover:text-ink',
				className
			)}
		>
			<Icon className="size-5" />
			<span className="group-hover:inline max-md:hidden">{label}</span>
		</Elem>
	)
}

const AppLink: FC<LinkProps> = ({ to, label, icon: Icon, className, end, ...rest }) => {
	const Elem =
		typeof to === 'string'
			? (props: HTMLAttributes<HTMLAnchorElement>) => <NavLink to={to} end={end} {...props} />
			: (props: HTMLAttributes<HTMLButtonElement>) => <button type="button" onClick={to} {...props} />
	return (
		<Elem
			{...rest}
			className={cn(
				'mx-auto space-y-0.5 py-2 text-center current:font-medium 2xs:text-sm current:text-accent text-ink-muted text-xs transition-colors',
				className
			)}
		>
			<Icon className="mx-auto 2xs:size-6 size-5" />
			<div>{label}</div>
		</Elem>
	)
}

const AppLinks: FC<{ links: Link[] }> = ({ links }) => links.map(link => <AppLink key={link.to} {...link} />)
