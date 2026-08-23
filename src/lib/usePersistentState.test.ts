import { describe, expect, it } from 'vitest'
import { readStoredValue, writeStoredValue } from './usePersistentState'

type Value = 'a' | 'b'
const isValue = (v: unknown): v is Value => v === 'a' || v === 'b'

// Node test env has no `window` — exercises the SSR/storage-absent guards.
describe('readStoredValue', () => {
	it('returns fallback when no window exists', () => {
		expect(readStoredValue('test:key', isValue, 'a')).toBe('a')
	})
})

describe('writeStoredValue', () => {
	it('does not throw when no window exists', () => {
		expect(() => writeStoredValue('test:key', 'b')).not.toThrow()
	})
})
