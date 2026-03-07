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
import type { FC, HTMLAttributes } from 'react'
import { NavLink } from 'react-router-dom'
import { OfflineIndicator } from '~/components/ui/OfflineIndicator'
import { RestTimer } from '~/features/workouts/components/RestTimer'
import { cn } from '~/lib'

const publicLinks = [
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed }
] satisfies Link[]

const desktopAuthLinks = [
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell }
] satisfies Link[]

const mobileAuthLinks = [
	{ to: '/plans', label: 'Plans', icon: CalendarDays },
	{ to: '/workouts', label: 'Workouts', icon: Dumbbell }
] satisfies Link[]

export interface Link {
	to: string
	label: string
	icon: LucideIcon
	end?: boolean
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
						<SignedIn>
							<WebLink to="/settings" icon={Settings} />
							<UserButton />
						</SignedIn>
						<SignedOut>
							<SignInButton mode="modal">
								<WebLink icon={LogIn} label="Sign in" />
							</SignInButton>
						</SignedOut>
					</div>
				</div>
			</nav>

			{/* Mobile bottom tab bar */}
			<nav className="fixed right-0 bottom-0 left-0 z-50 border-edge border-t bg-surface-1 md:hidden">
				<div className="grid auto-cols-fr grid-flow-col justify-center px-3 2xs:py-1">
					<AppLinks links={publicLinks} />
					<SignedIn>
						<AppLinks links={mobileAuthLinks} />
					</SignedIn>
					<SignedOut>
						<SignInButton mode="modal">
							<AppLink icon={LogIn} label="Sign in" />
						</SignInButton>
					</SignedOut>
				</div>
			</nav>
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
				'group flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-ink-muted text-sm transition-colors hover:text-ink active:bg-surface-2 active:font-medium active:text-ink',
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
				'mx-auto space-y-0.5 py-2 text-center 2xs:text-sm text-ink-muted text-xs transition-colors active:font-medium active:text-accent',
				className
			)}
		>
			<Icon className="mx-auto 2xs:size-6 size-5" />
			<div>{label}</div>
		</Elem>
	)
}

const AppLinks: FC<{ links: Link[] }> = ({ links }) => links.map(link => <AppLink key={link.to} {...link} />)
