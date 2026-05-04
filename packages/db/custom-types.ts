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
