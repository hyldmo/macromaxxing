import { Plus } from 'lucide-react'
import type { FC } from 'react'
import { Card, LinkButton, Spinner, TRPCError } from '~/components/ui'
import { trpc } from '~/lib/trpc'
import { ProgramCard } from './ProgramCard'

export const ProgramsSection: FC = () => {
	const programsQuery = trpc.workout.listPrograms.useQuery()
	const summaryQuery = trpc.dashboard.summary.useQuery()
	const utils = trpc.useUtils()

	const setActive = trpc.workout.setActiveProgram.useMutation({
		onSuccess: () => {
			utils.dashboard.summary.invalidate()
			utils.workout.listPrograms.invalidate()
		}
	})

	const activeProgramId = summaryQuery.data?.activeProgram?.id ?? null
	const templates = summaryQuery.data?.templates ?? []

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-ink">Workout Programs</h2>
				<LinkButton to="/plans/programs/new">
					<Plus className="size-4" />
					New program
				</LinkButton>
			</div>

			{programsQuery.isLoading && (
				<div className="flex justify-center py-6">
					<Spinner />
				</div>
			)}
			{programsQuery.error && <TRPCError error={programsQuery.error} />}

			{programsQuery.data && programsQuery.data.length === 0 && (
				<Card className="py-6 text-center text-ink-faint text-sm">
					No programs yet. Create one to control which workouts your dashboard cycles through.
				</Card>
			)}

			<div className="grid gap-2">
				{programsQuery.data?.map(program => (
					<ProgramCard
						key={program.id}
						program={program}
						templates={templates}
						isActive={program.id === activeProgramId}
						onToggleActive={() =>
							setActive.mutate({ id: program.id === activeProgramId ? null : program.id })
						}
						isToggling={setActive.isPending}
					/>
				))}
			</div>

			{setActive.error && <TRPCError error={setActive.error} />}
		</section>
	)
}
