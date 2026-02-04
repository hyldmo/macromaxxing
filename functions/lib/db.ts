import { drizzle } from 'drizzle-orm/d1'
import * as relations from './relations'
import * as schema from './schema'

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema: { ...schema, ...relations } })
}

export type Database = ReturnType<typeof createDb>
