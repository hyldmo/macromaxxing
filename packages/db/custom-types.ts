import { text } from 'drizzle-orm/sqlite-core'
import { startCase } from 'es-toolkit'
import { typeid } from 'typeid-js'
import { z } from 'zod'

// Defines the strict TS type: e.g. "ing_01h2x..."
export type TypeIDString<T extends string> = `${T}_${string}`

// Typed ID column using text with branded type (compatible with drizzle-zod)
export const typeidCol = <T extends string>(_prefix: T) => {
	return (name: string) => text(name).$type<TypeIDString<T>>()
}

// Helper to generate a default value
export const newId = <T extends string>(prefix: T) => typeid(prefix).toString() as TypeIDString<T>

export const zodTypeID = <T extends string>(prefix: T) =>
	z.custom<TypeIDString<T>>(val => typeof val === 'string' && val.startsWith(`${prefix}_`))

export type AiProvider = z.infer<typeof zAiProvider>
export const zAiProvider = z.enum(['gemini', 'openai', 'anthropic'])
export const AI_PROVIDER_OPTIONS = zAiProvider.options.map(p => ({ value: p, label: startCase(p) }))

export const sex = z.enum(['male', 'female'])
export type Sex = z.infer<typeof sex>

export const setMode = z.enum(['working', 'warmup', 'backoff', 'full'])
export type SetMode = z.infer<typeof setMode>
export type SetType = Exclude<SetMode, 'full'>

export const trainingGoal = z.enum(['hypertrophy', 'strength'])
export type TrainingGoal = z.infer<typeof trainingGoal>

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
