export interface ExerciseGuide {
	/** One-sentence summary of the movement. */
	description: string
	/** Ordered form cues (3-5 recommended). Keep actionable and specific. */
	cues: string[]
	/** Common pitfalls to avoid (optional). */
	pitfalls?: string[]
}

/**
 * Text-only guides for system exercises, keyed by the exact `name` in
 * `scripts/seed-exercises.ts`. Names are used (not IDs) so the data is
 * readable in git and survives any future id scheme change. A lookup miss
 * is the normal path for user-created exercises — callers show a fallback.
 */
export const EXERCISE_GUIDES: Record<string, ExerciseGuide> = {
	'Bench Press': {
		description: 'Pressing a barbell from chest to lockout while lying flat on a bench.',
		cues: [
			'Feet planted, shoulder blades pinched and tucked into the bench.',
			'Grip just outside shoulder-width.',
			'Lower the bar to the mid-chest / nipple line under control.',
			'Keep elbows tucked roughly 45–75° from the torso — not flared straight out.',
			'Press in a slight backward arc so the bar finishes over the shoulders.'
		],
		pitfalls: [
			'Flaring the elbows 90° from the torso (shoulder risk).',
			'Bouncing the bar off the chest.',
			'Losing upper-back tightness mid-set.'
		]
	},
	'Incline Bench Press': {
		description: 'Bench press on a 30–45° incline bench to bias the upper chest and front delts.',
		cues: [
			'Set the bench around 30° — higher becomes more of an overhead press.',
			'Feet planted, upper back locked against the bench.',
			'Lower the bar to the upper chest / collarbone area, not the mid-chest.',
			'Same elbow discipline as flat bench — tucked, not flared.'
		],
		pitfalls: [
			'Bench angle steeper than 45° (shifts work off the chest entirely).',
			'Lowering the bar to the mid-chest instead of the upper chest.'
		]
	},
	'Overhead Press': {
		description: 'Standing barbell press from the shoulders to a locked-out position overhead.',
		cues: [
			'Bar resting on front delts at the start, grip just outside the shoulders.',
			'Elbows slightly in front of the bar.',
			'Brace core and squeeze glutes before pressing.',
			'Press straight up past the face, then stack the bar over ears / shoulders at lockout.'
		],
		pitfalls: [
			'Excessive backward lean (lower-back strain).',
			'Bar drifting forward of the shoulders at lockout.',
			'Loose core — the press becomes a half-squat-press.'
		]
	},
	'Barbell Row': {
		description: 'Bent-over pull with a barbell, driving the elbows back to work the mid-back and lats.',
		cues: [
			'Hinge until the torso is 45° or lower — not upright.',
			'Neutral spine, bar starting under the shoulders.',
			'Pull toward the lower ribs / belly button, not the chest.',
			'Squeeze the shoulder blades at the top.',
			'Control the eccentric — don’t drop the bar.'
		],
		pitfalls: [
			'Standing too upright (turns into a shrug).',
			'Jerking with the lower back.',
			'Rowing to the chest instead of the belly.'
		]
	},
	'Pull-Up': {
		description: 'Vertical pull from a dead hang until the chin clears the bar.',
		cues: [
			'Grip slightly wider than shoulders.',
			'Start from a full hang with active shoulders — not fully relaxed.',
			'Drive elbows down and back, pulling the chest toward the bar.',
			'Control the descent to a full hang, not a drop.'
		],
		pitfalls: [
			'Stopping short of chin-over-bar (partial reps).',
			'Kipping unintentionally with the hips.',
			'Fully relaxing at the bottom (shoulder instability).'
		]
	},
	Squat: {
		description: 'Loaded knee and hip flexion with a barbell across the upper back.',
		cues: [
			'Bar on upper traps (high bar) or rear delts (low bar).',
			'Feet shoulder-width with slight toe-out.',
			'Brace hard before unracking.',
			'Sit back and down together; knees track over toes.',
			'Break parallel if mobility allows, then drive through the whole foot.'
		],
		pitfalls: [
			'Knees caving inward.',
			'Losing the brace on the descent.',
			'Rounding the lower back at the bottom.',
			'Heels coming off the floor.'
		]
	},
	Deadlift: {
		description: 'Lifting a loaded barbell from the floor to a standing position.',
		cues: [
			'Bar over mid-foot, hips higher than the knees at the start.',
			'Shoulders slightly ahead of the bar.',
			'Neutral spine; take slack out of the bar before pulling.',
			'Push the floor away rather than yanking the bar up.',
			'Lock hips and knees together at the top — no hyperextension.'
		],
		pitfalls: [
			'Rounding the lower back.',
			'Jerking the bar off the floor.',
			'Bar drifting away from the shins.',
			'Over-extending at lockout to “finish” the lift.'
		]
	},
	'Romanian Deadlift': {
		description: 'Hip-hinge variation keeping knees only slightly bent to load the hamstrings.',
		cues: [
			'Start standing with the bar at the hips.',
			'Soft knees — don’t bend them further as you descend.',
			'Push the hips straight back; the bar travels close to the legs.',
			'Stop when you feel a strong hamstring stretch (usually just below the knees).',
			'Drive the hips forward to stand up.'
		],
		pitfalls: [
			'Bending the knees like a conventional deadlift.',
			'Rounding the lower back.',
			'Going lower than your mobility allows.'
		]
	},
	'Lateral Raise': {
		description: 'Raising dumbbells out to the sides to isolate the side delts.',
		cues: [
			'Slight forward lean, small constant bend in the elbows.',
			'Lead with the elbows, not the hands.',
			'Raise to roughly shoulder height.',
			'Pause briefly at the top, then lower under control.'
		],
		pitfalls: [
			'Heaving with the torso for momentum.',
			'Raising above shoulder height (shrug territory).',
			'Straight elbows — stress on the elbow joint.'
		]
	},
	'Bicep Curl': {
		description: 'Elbow flexion with dumbbells or a barbell to isolate the biceps.',
		cues: [
			'Elbows pinned close to the torso.',
			'Start from full extension.',
			'Supinate the wrists fully at the top.',
			'Squeeze at the peak, lower under control over 2–3 seconds.'
		],
		pitfalls: ['Elbows drifting forward (turns into a front-raise).', 'Half-reps.', 'Bouncing out of the bottom.']
	},
	'Tricep Extension': {
		description: 'Elbow extension under load — overhead, lying (skullcrusher), or cable pushdown variants.',
		cues: [
			'Keep the upper arms fixed — only the forearm moves.',
			'Full stretch at the bottom, full extension at the top.',
			'Avoid flaring the elbows outward.',
			'Control the eccentric — don’t freefall.'
		],
		pitfalls: [
			'Upper arms shifting (turns into a press).',
			'Short range of motion.',
			'Slamming the elbow joint at lockout.'
		]
	},
	'Leg Curl': {
		description: 'Knee flexion under load on a lying, seated, or standing machine.',
		cues: [
			'Align the knee joint with the machine pivot.',
			'Hips pressed into the pad throughout.',
			'Full range — full extension to full curl.',
			'Pause at peak contraction, control the eccentric.'
		],
		pitfalls: ['Hips rising off the pad.', 'Partial range of motion.', 'Jerking the weight up with momentum.']
	},
	'Leg Extension': {
		description: 'Knee extension under load on a machine, isolating the quads.',
		cues: [
			'Align the knee joint with the pivot.',
			'Back pressed into the seat.',
			'Extend fully at the top without hyperextending.',
			'Lower under control — no bouncing at the bottom.'
		],
		pitfalls: [
			'Heavy loads forcing the hips to rock.',
			'Aggressive hyperextension at the top.',
			'Bouncing out of the bottom stretch.'
		]
	},
	'Calf Raise': {
		description: 'Ankle plantarflexion under load — standing (gastrocnemius) or seated (soleus).',
		cues: [
			'Ball of the foot on a raised edge.',
			'Drop the heels below the edge at the bottom for a full stretch.',
			'Drive through the big toe to the top.',
			'Pause at peak contraction, slow eccentric.'
		],
		pitfalls: [
			'Bouncing at the bottom.',
			'Short range of motion (no stretch).',
			'Rolling onto the outside of the foot.'
		]
	},
	'Rear Delt Fly': {
		description: 'Reverse arm-raise with dumbbells, cables, or a reverse pec-deck — isolates rear delts.',
		cues: [
			'Torso close to parallel with the floor (hinged, or use a bench / pec-deck).',
			'Slight constant bend in the elbows.',
			'Lead with the elbows; pull back and slightly wide.',
			'Pause at the top without shrugging.'
		],
		pitfalls: [
			'Using the traps / upper back instead of the rear delts.',
			'Standing too upright (turns into a row).',
			'Jerking with the torso.'
		]
	},
	'Face Pull': {
		description: 'Cable pull to the face with ropes — external rotation plus rear-delt and upper-back work.',
		cues: [
			'Cable set above head height.',
			'Grip the ropes with thumbs pointing back.',
			'Pull the ropes apart as you pull them toward the face.',
			'Elbows stay high — above the shoulders.',
			'Externally rotate at the end so the hands finish alongside the head.'
		],
		pitfalls: [
			'Pulling straight to the face without external rotation.',
			'Letting the elbows drop (turns into a high row).',
			'Loading too heavy — form collapses quickly.'
		]
	},
	'Cable Fly': {
		description: 'Adduction of the arms under cable tension — isolates the chest.',
		cues: [
			'Slight forward lean with a stable stance.',
			'Soft constant bend in the elbows.',
			'Start with arms wide and the chest stretched.',
			'Sweep the hands together in front of the body.',
			'Squeeze the chest at the finish.'
		],
		pitfalls: [
			'Bending the elbows more as you pull (turns into a pressdown).',
			'Going too wide at the start — shoulder strain.',
			'Losing the scapular position.'
		]
	},
	'Preacher Curl': {
		description: 'Curl performed with the upper arms supported on a preacher bench, restricting cheat.',
		cues: [
			'Arms fully against the pad, grip shoulder-width.',
			'Lower under control — no freefall at the bottom.',
			'Curl to the top without letting the elbows lift off the pad.',
			'Squeeze at the peak.'
		],
		pitfalls: [
			'Dropping the weight at the bottom (elbow-joint stress).',
			'Letting the elbows lift off the pad.',
			'Using a grip that’s too wide or too narrow.'
		]
	},
	'Hammer Curl': {
		description: 'Neutral-grip dumbbell curl that trains biceps plus brachialis / brachioradialis.',
		cues: [
			'Palms face each other throughout — neutral grip.',
			'Elbows pinned close to the torso.',
			'Curl one or both dumbbells up with control.',
			'Squeeze at the top, slow eccentric.'
		],
		pitfalls: ['Rotating the wrist into a supinated curl.', 'Elbows swinging forward.', 'Half-reps.']
	},
	'Wrist Curl': {
		description: 'Wrist flexion (or extension) with a dumbbell or barbell — isolates the forearms.',
		cues: [
			'Forearm supported on a bench or thigh, wrist hanging over the edge.',
			'Only the wrist moves.',
			'Full range — full extension to full flexion.',
			'Controlled tempo; avoid white-knuckle gripping.'
		],
		pitfalls: [
			'Moving the elbow or forearm.',
			'Short range of motion.',
			'Gripping too tight (work shifts off the wrist).'
		]
	}
}
