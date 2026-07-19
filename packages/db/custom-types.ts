import { text } from 'drizzle-orm/sqlite-core'
import { startCase } from 'es-toolkit'
import { typeid } from 'typeid-js'
import { z } from 'zod'

export type Nullable<T> = T | null | undefined
// Defines the strict TS type: e.g. "ing_01h2x..."
export type TypeIDString<T extends string> = `${T}_${string}`

// Typed ID column using text with branded type (compatible with drizzle-zod)
export const typeidCol = <T extends string>(_prefix: T) => {
	return (name: string) => text(name).$type<TypeIDString<T>>()
}

// Helper to generate a default value
export const newId = <T extends string>(prefix: T) => typeid(prefix).toString() as TypeIDString<T>

// Use templateLiteral so Zod can emit proper JSON Schema (required by MCP tool
// registration). z.custom() has no JSON Schema representation and throws at
// conversion time.
export const zodTypeID = <T extends string>(prefix: T) => z.templateLiteral([prefix, '_', z.string()])

export type AiProvider = z.infer<typeof zAiProvider>
export const zAiProvider = z.enum(['gemini', 'openai', 'anthropic'])
export const AI_PROVIDER_OPTIONS = zAiProvider.options.map(p => ({ value: p, label: startCase(p) }))

export const ingredientSource = z.enum(['manual', 'ai', 'usda', 'openfoodfacts', 'label'])
export type IngredientSource = z.infer<typeof ingredientSource>

export const sex = z.enum(['male', 'female'])
export type Sex = z.infer<typeof sex>

export const setMode = z.enum(['working', 'warmup', 'backoff', 'full'])
export type SetMode = z.infer<typeof setMode>
export type SetType = Exclude<SetMode, 'full'>

export type HttpsUrl = `https://${string}`
export type ImageSource = HttpsUrl | TypeIDString<'rcp'>

export const zImageSource = z.union([z.templateLiteral(['https://', z.string()]), zodTypeID('rcp')])

export const trainingGoal = z.enum(['hypertrophy', 'strength'])
export type TrainingGoal = z.infer<typeof trainingGoal>

export const exerciseType = z.enum(['compound', 'isolation'])
export type ExerciseType = z.infer<typeof exerciseType>

export const fatigueTier = z.literal([1, 2, 3, 4])
export type FatigueTier = z.infer<typeof fatigueTier>

export const EQUIPMENT = [
	// Free weights
	'barbell',
	'ez_bar',
	'trap_bar',
	'dumbbell',
	'kettlebell',
	// Racks & benches
	'squat_rack',
	'bench_flat',
	'bench_adjustable',
	'preacher_bench',
	'smith_machine',
	// Cables
	'cable_station',
	'lat_pulldown',
	// Machines
	'pec_deck',
	'chest_press_machine',
	'shoulder_press_machine',
	'chest_supported_row',
	'leg_press',
	'hack_squat',
	'leg_curl_machine',
	'leg_extension_machine',
	'calf_machine',
	'hip_thrust_machine',
	'back_extension',
	// Rig & bodyweight
	'pullup_bar',
	'dip_station',
	'suspension_trainer',
	'resistance_band',
	// Conditioning
	'sled',
	'battle_ropes',
	'boxing_bag',
	// Cardio
	'rowing_machine',
	'ski_erg',
	'air_bike',
	'spin_bike',
	'treadmill',
	'stair_climber'
] as const

export type Equipment = (typeof EQUIPMENT)[number]

export const MUSCLE_GROUPS = [
	'chest',
	'upper_back',
	'lats',
	'front_delts',
	'side_delts',
	'rear_delts',
	'biceps',
	'triceps',
	'forearms',
	'quads',
	'hamstrings',
	'glutes',
	'calves',
	'core'
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]
