import { describe, expect, it } from 'vitest'
import { hashToken } from './mcp-auth'

describe('hashToken', () => {
	it('produces a consistent hex hash for the same input', async () => {
		const hash1 = await hashToken('test-token-123')
		const hash2 = await hashToken('test-token-123')
		expect(hash1).toBe(hash2)
	})

	it('produces different hashes for different inputs', async () => {
		const hash1 = await hashToken('token-a')
		const hash2 = await hashToken('token-b')
		expect(hash1).not.toBe(hash2)
	})

	it('returns a 64-character hex string (SHA-256)', async () => {
		const hash = await hashToken('any-token')
		expect(hash).toMatch(/^[a-f0-9]{64}$/)
	})
})
