const round = (w: number) => Math.round(w / 2.5) * 2.5

export interface GeneratedSet {
	weightKg: number
	reps: number
	setType: 'warmup' | 'backoff'
}

export function generateWarmupSets(workingWeight: number, _workingReps: number): GeneratedSet[] {
	const bar = 20
	const sets: GeneratedSet[] = []

	if (workingWeight > bar * 2) {
		sets.push({ weightKg: bar, reps: 10, setType: 'warmup' })
	}

	const pcts = [0.5, 0.7, 0.85] as const
	for (const pct of pcts) {
		const w = round(workingWeight * pct)
		if (w <= bar) continue
		if (workingWeight - w < 5) continue
		if (sets.length > 0 && sets[sets.length - 1].weightKg === w) continue
		const reps = pct <= 0.5 ? 8 : pct <= 0.7 ? 5 : 3
		sets.push({ weightKg: w, reps, setType: 'warmup' })
	}

	return sets
}

export function generateBackoffSets(workingWeight: number, workingReps: number, count = 2): GeneratedSet[] {
	const sets: GeneratedSet[] = []
	for (let i = 0; i < count; i++) {
		const pct = 0.8 - i * 0.1
		sets.push({
			weightKg: round(workingWeight * pct),
			reps: workingReps + 2 * (i + 1),
			setType: 'backoff'
		})
	}
	return sets
}
