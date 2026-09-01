import { describe, expect, it } from 'vitest'
import { pushErrorStatus } from './web-push'

describe('pushErrorStatus', () => {
	it('reads provider status codes without assuming every error shape', () => {
		expect(pushErrorStatus({ statusCode: 410 })).toBe(410)
		expect(pushErrorStatus(new Error('offline'))).toBeNull()
		expect(pushErrorStatus(null)).toBeNull()
	})
})
