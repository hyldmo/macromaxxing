import { SignedIn, SignedOut } from '@clerk/clerk-react'
import type { AbsoluteMacros, TypeIDString } from '@macromaxxing/db'
import { CalendarDays, ChevronRight, Dumbbell, MapPin, Play, SkipForward, UtensilsCrossed } from 'lucide-react'
import { type FC, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Card, CardContent, CardHeader, Spinner, TRPCError } from '~/components/ui'
import { LandingPage } from '~/features/landing'
import { MacroBar } from '~/features/recipes/components/MacroBar'
import { MacroRing } from '~/features/recipes/components/MacroRing'
import {
	calculateDayTotals,
	calculatePortionMacros,
	calculateRecipeTotals,
	calculateSlotMacros,
	getEffectiveCookedWeight,
	toIngredientWithAmount
} from '~/features/recipes/utils/macros'
import { MuscleReadinessChip } from '~/features/workouts/components/MuscleChip'
import { SessionCard } from '~/features/workouts/components/SessionCard'
import {
	cn,
	computeMuscleReadiness,
	DAYS_LONG,
	estimateWorkoutDurationSec,
	type ProgramCycleResult,
	pendingRecovery,
	pickNextWorkout,
	prefetchRoute,
	totalVolume,
	useDocumentTitle
} from '~/lib'
import type { RouterOutput } from '~/lib/trpc'
import { trpc } from '~/lib/trpc'

export const clientLoader = () => prefetchRoute(utils => [utils.dashboard.summary.ensureData()])

type Template = RouterOutput['dashboard']['summary']['templates'][number]

function todayDayIndex(): number {
	const d = new Date().getDay() // 0=Sun, 6=Sat
	return d === 0 ? 6 : d - 1 // Convert to 0=Mon..6=Sun
}

function formatRelativeDate(ts: number): string {
	const now = Date.now()
	const diffMs = now - ts
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
	if (diffDays === 0) return 'Today'
	if (diffDays === 1) return 'Yesterday'
	if (diffDays < 7) return `${diffDays} days ago`
	return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface MealSlotMacros {
	recipeName: string
	planName: string
	planId: string
	portions: number
	macros: AbsoluteMacros
}

function computeTodayMeals(plans: RouterOutput['dashboard']['summary']['plans']): MealSlotMacros[] {
	const today = todayDayIndex()
	const meals: MealSlotMacros[] = []

	for (const plan of plans) {
		for (const inv of plan.inventory) {
			const todaySlots = inv.slots.filter(s => s.dayOfWeek === today)
			if (todaySlots.length === 0) continue

			const recipe = inv.recipe
			const items = recipe.recipeIngredients.map(toIngredientWithAmount)
			const recipeTotals = calculateRecipeTotals(items)
			const cookedWeight = getEffectiveCookedWeight(recipeTotals.weight, recipe.cookedWeight)
			const portionMacros = calculatePortionMacros(recipeTotals, cookedWeight, recipe.portionSize)

			for (const slot of todaySlots) {
				meals.push({
					recipeName: recipe.name,
					planName: plan.name,
					planId: plan.id,
					portions: slot.portions,
					macros: calculateSlotMacros(portionMacros, slot.portions)
				})
			}
		}
	}

	return meals
}

const DashboardPage: FC = () => (
	<>
		<SignedOut>
			<LandingPage />
		</SignedOut>
		<SignedIn>
			<DashboardContent />
		</SignedIn>
	</>
)

export default DashboardPage

const DashboardContent: FC = () => {
	useDocumentTitle('Dashboard')
	const navigate = useNavigate()
	const summaryQuery = trpc.dashboard.summary.useQuery()
	const utils = trpc.useUtils()

	const createSessionMutation = trpc.workout.createSession.useMutation({
		onSuccess: session => {
			utils.dashboard.summary.invalidate()
			navigate(`/workouts/sessions/${session.id}`)
		}
	})

	const todayMeals = useMemo(
		() => (summaryQuery.data ? computeTodayMeals(summaryQuery.data.plans) : []),
		[summaryQuery.data]
	)

	const dayTotals = useMemo(() => calculateDayTotals(todayMeals.map(m => m.macros)), [todayMeals])

	const cycleResult = useMemo<ProgramCycleResult<Template> | null>(() => {
		const data = summaryQuery.data
		if (!data) return null
		return pickNextWorkout(data.templates, data.sessions, data.activeProgram ?? null)
	}, [summaryQuery.data])

	// When an active program is set, scope the template list to program members in cycle order.
	// Off-program templates are still accessible from /workouts.
	const visibleTemplates = useMemo(() => {
		const data = summaryQuery.data
		if (!data) return []
		const { templates, activeProgram } = data
		if (!activeProgram || activeProgram.workoutIds.length === 0) return templates
		const byId = new Map(templates.map(t => [t.id, t]))
		return activeProgram.workoutIds.flatMap(id => {
			const t = byId.get(id)
			return t ? [t] : []
		})
	}, [summaryQuery.data])

	if (summaryQuery.isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spinner />
			</div>
		)
	}

	if (!summaryQuery.data) {
		return <TRPCError error={summaryQuery.error} />
	}

	const { sessions } = summaryQuery.data
	const activeSession = sessions.find(s => !s.completedAt)
	const recentCompleted = sessions.filter(s => s.completedAt).slice(0, 3)
	const today = todayDayIndex()

	const cycleForDisplay = !activeSession ? cycleResult : null

	return (
		<div className="space-y-4">
			{summaryQuery.error && <TRPCError error={summaryQuery.error} />}
			<h1 className="font-semibold text-ink text-lg">{DAYS_LONG[today]}</h1>

			<div className="grid gap-4 lg:grid-cols-2">
				{/* Left column: Today's Meals */}
				<div className="space-y-3">
					<TodayMealsSection meals={todayMeals} dayTotals={dayTotals} />
				</div>

				{/* Right column: Workouts */}
				<div className="space-y-3">
					{activeSession && <ActiveSessionBanner session={activeSession} />}
					{cycleForDisplay?.kind === 'emptyActiveProgram' && (
						<EmptyProgramBanner
							programName={cycleForDisplay.programName}
							programId={cycleForDisplay.programId}
						/>
					)}
					<WorkoutTemplatesSection
						templates={visibleTemplates}
						sessions={sessions}
						cycleResult={cycleForDisplay}
						onStartSession={id => createSessionMutation.mutate({ workoutId: id })}
						isPending={createSessionMutation.isPending}
					/>
					{recentCompleted.length > 0 && <RecentSessionsSection sessions={recentCompleted} />}
				</div>
			</div>
		</div>
	)
}

// ─── Today's Meals ───────────────────────────────────────────────────

interface TodayMealsSectionProps {
	meals: MealSlotMacros[]
	dayTotals: AbsoluteMacros
}

const TodayMealsSection: FC<TodayMealsSectionProps> = ({ meals, dayTotals }) => (
	<Card>
		<CardHeader>
			<div className="flex items-center gap-2">
				<UtensilsCrossed className="size-4 text-ink-muted" />
				<h2 className="font-medium text-ink text-sm">Today's Meals</h2>
			</div>
		</CardHeader>
		<CardContent className="space-y-3">
			{meals.length === 0 ? (
				<div className="py-4 text-center text-ink-faint text-sm">
					No meals planned for today.{' '}
					<Link to="/plans" className="text-accent hover:underline">
						Open meal plans
					</Link>
				</div>
			) : (
				<>
					{/* Macro summary */}
					<div className="flex items-center gap-4">
						<MacroRing macros={dayTotals} size="md" />
						<div className="flex-1 space-y-1">
							<div className="font-bold font-mono text-macro-kcal tabular-nums">
								{dayTotals.kcal.toFixed(0)} kcal
							</div>
							<div className="flex gap-3 font-mono text-sm tabular-nums">
								<span className="text-macro-protein">P {dayTotals.protein.toFixed(0)}g</span>
								<span className="text-macro-carbs">C {dayTotals.carbs.toFixed(0)}g</span>
								<span className="text-macro-fat">F {dayTotals.fat.toFixed(0)}g</span>
							</div>
							<MacroBar macros={dayTotals} />
						</div>
					</div>

					{/* Meal list */}
					<div className="space-y-1">
						{meals.map((meal, i) => (
							<Link
								key={`${meal.planId}-${meal.recipeName}-${i}`}
								to={`/plans/${meal.planId}`}
								className="flex items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate font-medium text-ink text-sm">{meal.recipeName}</div>
									<div className="font-mono text-ink-muted text-xs tabular-nums">
										{meal.portions > 1 && `${meal.portions}× · `}
										{meal.macros.kcal.toFixed(0)} kcal · P {meal.macros.protein.toFixed(0)}g · C{' '}
										{meal.macros.carbs.toFixed(0)}g · F {meal.macros.fat.toFixed(0)}g
									</div>
								</div>
								<ChevronRight className="size-4 shrink-0 text-ink-faint" />
							</Link>
						))}
					</div>
				</>
			)}
		</CardContent>
	</Card>
)

// ─── Active Session Banner ───────────────────────────────────────────

interface ActiveSessionBannerProps {
	session: RouterOutput['dashboard']['summary']['sessions'][number]
}

const ActiveSessionBanner: FC<ActiveSessionBannerProps> = ({ session }) => {
	const vol = totalVolume(session.logs)

	return (
		<Link to={`/workouts/sessions/${session.id}`}>
			<Card className="border-accent bg-accent/5 transition-colors hover:bg-accent/10">
				<CardContent>
					<div className="flex items-center gap-3">
						<div className="flex size-8 items-center justify-center rounded-full bg-accent/20">
							<Play className="size-4 text-accent" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="font-medium text-ink text-sm">
								{session.name ?? 'Workout'} — in progress
							</div>
							<div className="font-mono text-ink-muted text-xs tabular-nums">
								{session.logs.length} sets · {(vol / 1000).toFixed(1)}k vol
								{session.location && ` · ${session.location.name}`}
							</div>
						</div>
						<ChevronRight className="size-4 shrink-0 text-ink-faint" />
					</div>
				</CardContent>
			</Card>
		</Link>
	)
}

// ─── Workout Templates ───────────────────────────────────────────────

interface WorkoutTemplatesSectionProps {
	templates: RouterOutput['dashboard']['summary']['templates']
	sessions: RouterOutput['dashboard']['summary']['sessions']
	cycleResult: ProgramCycleResult<Template> | null
	onStartSession: (workoutId: RouterOutput['dashboard']['summary']['templates'][number]['id']) => void
	isPending: boolean
}

const WorkoutTemplatesSection: FC<WorkoutTemplatesSectionProps> = ({
	templates,
	sessions,
	cycleResult,
	onStartSession,
	isPending
}) => {
	// Find last session per template to determine staleness
	const lastSessionByTemplate = useMemo(() => {
		const map = new Map<string, number>()
		for (const s of sessions) {
			if (s.workoutId && s.completedAt) {
				const existing = map.get(s.workoutId)
				if (!existing || s.completedAt > existing) {
					map.set(s.workoutId, s.completedAt)
				}
			}
		}
		return map
	}, [sessions])

	const nextTemplate = cycleResult && cycleResult.kind !== 'emptyActiveProgram' ? cycleResult.template : null
	const nextWorkoutId = nextTemplate?.id ?? null
	const programLink =
		cycleResult?.kind === 'program' ? { name: cycleResult.programName, id: cycleResult.programId } : null

	// Muscles the up-next workout trains that are still inside their recovery window
	// from recently logged sessions. Advisory only — chips, never a blocker.
	const pendingMuscles = useMemo(
		() => (nextTemplate ? pendingRecovery(nextTemplate, computeMuscleReadiness(sessions), Date.now()) : []),
		[nextTemplate, sessions]
	)

	// Rotate templates so the "up next" workout is first
	const orderedTemplates = useMemo(() => {
		if (!nextWorkoutId || templates.length === 0) return templates
		const idx = templates.findIndex(t => t.id === nextWorkoutId)
		if (idx <= 0) return templates
		return [...templates.slice(idx), ...templates.slice(0, idx)]
	}, [templates, nextWorkoutId])

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Dumbbell className="size-4 text-ink-muted" />
					<h2 className="font-medium text-ink text-sm">Workouts</h2>
					{programLink && (
						<Link
							to={`/plans/programs/${programLink.id}`}
							className="font-mono text-ink-faint text-xs tabular-nums hover:text-ink hover:underline"
						>
							{programLink.name}
						</Link>
					)}
					<Link to="/workouts" className="ml-auto text-ink-faint text-xs hover:text-ink">
						View all
					</Link>
				</div>
			</CardHeader>
			<CardContent className="space-y-1">
				{templates.length === 0 ? (
					<div className="py-4 text-center text-ink-faint text-sm">
						No workout templates yet.{' '}
						<Link to="/workouts/new" className="text-accent hover:underline">
							Create one
						</Link>
					</div>
				) : (
					orderedTemplates.map(template => {
						const isUpNext = template.id === nextWorkoutId
						const lastDone = lastSessionByTemplate.get(template.id)
						const durationMin = Math.round(estimateWorkoutDurationSec(template) / 60)
						return (
							<div
								key={template.id}
								className={cn(
									'flex items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2',
									isUpNext && 'border border-accent bg-accent/5'
								)}
							>
								{isUpNext && <SkipForward className="size-3.5 shrink-0 text-accent" />}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<Link
											to={`/workouts/${template.id}`}
											className="min-w-0 truncate font-medium text-ink text-sm hover:underline"
										>
											{template.name}
										</Link>
										{template.location && (
											<span className="flex shrink-0 items-center gap-0.5 text-ink-faint text-xs">
												<MapPin className="size-3 shrink-0" />
												<span className="max-w-24 truncate">{template.location.name}</span>
											</span>
										)}
										{isUpNext && <span className="shrink-0 text-accent text-xs">Up next</span>}
									</div>
									<div className="font-mono text-ink-faint text-xs tabular-nums">
										{template.exercises.length} exercises
										{durationMin > 0 && ` · ~${durationMin} min`}
										{lastDone && ` · ${formatRelativeDate(lastDone)}`}
									</div>
									{isUpNext && pendingMuscles.length > 0 && (
										<div className="mt-1 flex flex-wrap gap-1">
											{pendingMuscles.map(m => (
												<MuscleReadinessChip
													key={m.muscleGroup}
													muscleGroup={m.muscleGroup}
													remainingHours={m.remainingHours}
													readyAt={m.readyAt}
												/>
											))}
										</div>
									)}
								</div>
								<Button size="sm" onClick={() => onStartSession(template.id)} disabled={isPending}>
									<Play className="size-3.5" />
									Start
								</Button>
							</div>
						)
					})
				)}
			</CardContent>
		</Card>
	)
}

// ─── Empty Program Banner ────────────────────────────────────────────

const EmptyProgramBanner: FC<{ programName: string; programId: TypeIDString<'wpr'> }> = ({
	programName,
	programId
}) => (
	<Link to={`/plans/programs/${programId}`}>
		<Card className="border-amber-500/40 bg-amber-500/5 transition-colors hover:bg-amber-500/10">
			<CardContent>
				<div className="flex items-center gap-3">
					<div className="min-w-0 flex-1">
						<div className="font-medium text-ink text-sm">
							Active program "{programName}" has no workouts
						</div>
						<div className="text-ink-muted text-xs">Edit program →</div>
					</div>
					<ChevronRight className="size-4 shrink-0 text-ink-faint" />
				</div>
			</CardContent>
		</Card>
	</Link>
)

// ─── Recent Sessions ─────────────────────────────────────────────────

interface RecentSessionsSectionProps {
	sessions: RouterOutput['dashboard']['summary']['sessions']
}

const RecentSessionsSection: FC<RecentSessionsSectionProps> = ({ sessions }) => (
	<Card>
		<CardHeader>
			<div className="flex items-center gap-2">
				<CalendarDays className="size-4 text-ink-muted" />
				<h2 className="font-medium text-ink text-sm">Recent Sessions</h2>
			</div>
		</CardHeader>
		<CardContent className="space-y-1">
			{sessions.map(session => (
				<SessionCard key={session.id} session={session} />
			))}
		</CardContent>
	</Card>
)
