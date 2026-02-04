import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	schema: './functions/lib/schema.ts',
	out: './drizzle',
	dialect: 'sqlite'
})
