import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock, test, vi } from 'bun:test'

const stubbedGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>()

function stubGlobal(name: PropertyKey, value: unknown) {
	if (!stubbedGlobals.has(name)) stubbedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
	Object.defineProperty(globalThis, name, { configurable: true, writable: true, enumerable: true, value })
}

function unstubAllGlobals() {
	for (const [name, descriptor] of stubbedGlobals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor)
		else Reflect.deleteProperty(globalThis, name)
	}
	stubbedGlobals.clear()
}

// bun:test's vi has the timer and mock surface the suite uses, except these four.
vi.setSystemTime = jest.setSystemTime
vi.stubGlobal = stubGlobal
vi.unstubAllGlobals = unstubAllGlobals
vi.mocked = <T>(item: T) => item

mock.module('vitest', () => ({
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	test,
	vi
}))
