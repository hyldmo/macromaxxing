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
		<nav className="border-edge border-b bg-surface-1">
			<div className="mx-auto flex h-12 max-w-4xl items-center gap-6 px-4">
				<NavLink to="/" className="flex items-center gap-2 font-semibold text-accent">
					<ChefHat className="h-5 w-5" />
					<span className="tracking-tight">macromaxxing</span>
				</NavLink>
				<div className="flex gap-0.5">
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
	)
}
