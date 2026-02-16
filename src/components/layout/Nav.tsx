import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'
import {
	CalendarDays,
	ChefHat,
	CookingPot,
	Dumbbell,
	LogIn,
	type LucideIcon,
	Settings,
	UtensilsCrossed
} from 'lucide-react'
import type { FC } from 'react'
import { NavLink } from 'react-router-dom'
import { OfflineIndicator } from '~/components/ui/OfflineIndicator'
import { RestTimer } from '~/features/workouts/components/RestTimer'
import { cn } from '~/lib/cn'

const publicLinks = [
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed }
] satisfies Link[]

const authLinks = [
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell },
	{ to: '/settings', label: 'Settings', icon: Settings }
] satisfies Link[]

export interface Link {
	to: string
	label: string
	icon: LucideIcon
}

export function Nav() {
	return (
		<>
			{/* Desktop top nav */}
			<nav className="sticky top-0 z-50 border-edge border-b bg-surface-1">
				<div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
					<NavLink to="/" className="flex items-center gap-2 font-semibold text-accent">
						<ChefHat className="size-5" />
						<span className="tracking-tight">macromaxxing</span>
					</NavLink>
					<div className="hidden flex-1 md:flex">
						{publicLinks.map(({ to, label, icon: Icon }) => (
							<NavLink
								key={to}
								to={to}
								className={({ isActive }) =>
									cn(
										'group flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors',
										isActive ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:text-ink'
									)
								}
							>
								<Icon className="size-4" />
								<span className="group-hover:inline max-md:hidden">{label}</span>
							</NavLink>
						))}
						<SignedIn>
							{authLinks.map(({ to, label, icon: Icon }) => (
								<NavLink
									key={to}
									to={to}
									className={({ isActive }) =>
										cn(
											'group flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors',
											isActive
												? 'bg-surface-2 font-medium text-ink'
												: 'text-ink-muted hover:text-ink'
										)
									}
								>
									<Icon className="size-4" />
									<span className="group-hover:inline max-md:hidden">{label}</span>
								</NavLink>
							))}
						</SignedIn>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<OfflineIndicator />
						<RestTimer />
						<SignedIn>
							<NavLink
								to="/settings"
								className={({ isActive }) =>
									cn(
										'hidden rounded-sm p-1.5 transition-colors md:block',
										isActive ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'
									)
								}
							>
								<Settings className="size-5" />
							</NavLink>
						</SignedIn>
						<SignedIn>
							<UserButton />
						</SignedIn>
						<SignedOut>
							<SignInButton mode="modal">
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-ink-muted text-sm transition-colors hover:text-ink"
								>
									<LogIn className="size-4" />
									Sign in
								</button>
							</SignInButton>
						</SignedOut>
					</div>
				</div>
			</nav>

			{/* Mobile bottom tab bar */}
			<nav className="fixed right-0 bottom-0 left-0 z-50 border-edge border-t bg-surface-1 md:hidden">
				<div className="grid auto-cols-fr grid-flow-col justify-center">
					<AppLinks links={publicLinks} />
					<SignedIn>
						<AppLinks links={authLinks} />
					</SignedIn>
					<SignedOut>
						<SignInButton mode="modal">
							<button
								type="button"
								className="mx-auto space-y-0.5 py-2 text-center text-ink-muted text-xs transition-colors"
							>
								<LogIn className="mx-auto size-5" />
								<div>Sign in</div>
							</button>
						</SignInButton>
					</SignedOut>
				</div>
			</nav>
		</>
	)
}

const AppLink: FC<{ to: string; label: string; icon: LucideIcon }> = ({ to, label, icon: Icon }) => (
	<NavLink
		to={to}
		className={({ isActive }) =>
			cn(
				'mx-auto space-y-0.5 py-2 text-center text-xs transition-colors',
				isActive ? 'font-medium text-accent' : 'text-ink-muted'
			)
		}
	>
		<Icon className="mx-auto size-5" />
		<div>{label}</div>
	</NavLink>
)

const AppLinks: FC<{ links: Link[] }> = ({ links }) => links.map(link => <AppLink key={link.to} {...link} />)
