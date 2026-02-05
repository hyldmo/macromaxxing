import { ChefHat, CookingPot, Settings, UtensilsCrossed } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '~/lib/cn'

const links = [
	{ to: '/recipes', label: 'Recipes', icon: CookingPot },
	{ to: '/ingredients', label: 'Ingredients', icon: UtensilsCrossed },
	{ to: '/settings', label: 'Settings', icon: Settings }
] as const

export function Nav() {
	return (
		<>
			{/* Desktop top nav */}
			<nav className="border-edge border-b bg-surface-1">
				<div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-4">
					<NavLink to="/" className="flex items-center gap-2 font-semibold text-accent">
						<ChefHat className="h-5 w-5" />
						<span className="tracking-tight">macromaxxing</span>
					</NavLink>
					<div className="hidden gap-0.5 md:flex">
						{links.map(({ to, label, icon: Icon }) => (
							<NavLink
								key={to}
								to={to}
								className={({ isActive }) =>
									cn(
										'flex items-center gap-1.5 rounded-[--radius-sm] px-2.5 py-1.5 text-sm transition-colors',
										isActive ? 'bg-surface-2 font-medium text-ink' : 'text-ink-muted hover:text-ink'
									)
								}
							>
								<Icon className="h-4 w-4" />
								{label}
							</NavLink>
						))}
					</div>
				</div>
			</nav>

			{/* Mobile bottom tab bar */}
			<nav className="fixed right-0 bottom-0 left-0 z-50 border-edge border-t bg-surface-1 md:hidden">
				<div className="flex justify-around">
					{links.map(({ to, label, icon: Icon }) => (
						<NavLink
							key={to}
							to={to}
							className={({ isActive }) =>
								cn(
									'flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
									isActive ? 'font-medium text-accent' : 'text-ink-muted'
								)
							}
						>
							<Icon className="h-5 w-5" />
							{label}
						</NavLink>
					))}
				</div>
			</nav>
		</>
	)
}
