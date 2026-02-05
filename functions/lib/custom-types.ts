import { text } from 'drizzle-orm/sqlite-core'
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
