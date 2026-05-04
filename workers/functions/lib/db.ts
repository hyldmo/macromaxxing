import { relations } from '@macromaxxing/db'
import { drizzle } from 'drizzle-orm/d1'

export function createDb(d1: D1Database) {
	return drizzle(d1, { relations })
}

export type Database = ReturnType<typeof createDb>
