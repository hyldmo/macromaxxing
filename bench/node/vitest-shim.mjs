import assert from 'node:assert/strict'
import { mock } from 'node:test'

export { after as afterAll, afterEach, before as beforeAll, beforeEach, describe, it, test } from 'node:test'

function fail(message) {
	throw new assert.AssertionError({ message, operator: 'fail' })
}

const restores = []
let timersOn = false

function isAsymmetric(value) {
	return Boolean(value) && typeof value === 'object' && typeof value.asymmetricMatch === 'function'
}

function deepEqual(actual, expected) {
	if (isAsymmetric(expected)) return expected.asymmetricMatch(actual)
	if (Object.is(actual, expected)) return true
	if (typeof actual === 'number' && typeof expected === 'number' && Number.isNaN(actual) && Number.isNaN(expected))
		return true
	if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime()
	if (Array.isArray(expected) || Array.isArray(actual)) {
		if (!(Array.isArray(expected) && Array.isArray(actual)) || expected.length !== actual.length) return false
		return expected.every((item, index) => deepEqual(actual[index], item))
	}
	if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
		const expectedKeys = Object.keys(expected)
		const actualKeys = Object.keys(actual)
		if (expectedKeys.length !== actualKeys.length) return false
		return expectedKeys.every(key => deepEqual(actual[key], expected[key]))
	}
	return false
}

function matchObject(actual, expected) {
	if (isAsymmetric(expected)) return expected.asymmetricMatch(actual)
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length) return false
		return expected.every((item, index) => matchObject(actual[index], item))
	}
	if (expected && typeof expected === 'object') {
		if (!actual || typeof actual !== 'object') return false
		return Object.keys(expected).every(key => matchObject(actual[key], expected[key]))
	}
	return Object.is(actual, expected)
}

function callArguments(call) {
	if (Array.isArray(call)) return call
	if (call && Array.isArray(call.arguments)) return call.arguments
	return []
}

function callsOf(fn) {
	const calls = fn?.mock?.calls ?? []
	return calls.map(callArguments)
}

function assertion(actual, message, negate) {
	const check = (ok, text) => {
		if (negate ? ok : !ok) fail(message ?? text)
	}
	const matchers = {
		toBe(expected) {
			check(Object.is(actual, expected), `expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`)
		},
		toEqual(expected) {
			check(
				deepEqual(actual, expected),
				`expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
			)
		},
		toBeCloseTo(expected, digits = 2) {
			const tolerance = 10 ** -digits / 2
			check(Math.abs(actual - expected) < tolerance, `expected ${actual} to be close to ${expected}`)
		},
		toBeNull() {
			check(actual === null, `expected ${actual} to be null`)
		},
		toBeUndefined() {
			check(actual === undefined, `expected ${actual} to be undefined`)
		},
		toBeDefined() {
			check(actual !== undefined, 'expected value to be defined')
		},
		toBeGreaterThan(expected) {
			check(actual > expected, `expected ${actual} > ${expected}`)
		},
		toBeGreaterThanOrEqual(expected) {
			check(actual >= expected, `expected ${actual} >= ${expected}`)
		},
		toBeLessThan(expected) {
			check(actual < expected, `expected ${actual} < ${expected}`)
		},
		toBeLessThanOrEqual(expected) {
			check(actual <= expected, `expected ${actual} <= ${expected}`)
		},
		toHaveLength(expected) {
			check(actual?.length === expected, `expected length ${actual?.length} to be ${expected}`)
		},
		toContain(expected) {
			const ok =
				typeof actual === 'string'
					? actual.includes(expected)
					: Array.from(actual ?? []).some(item => Object.is(item, expected))
			check(ok, `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`)
		},
		toContainEqual(expected) {
			check(
				Array.from(actual ?? []).some(item => deepEqual(item, expected)),
				`expected ${JSON.stringify(actual)} to contain equal ${JSON.stringify(expected)}`
			)
		},
		toMatch(expected) {
			check(expected.test(actual), `expected ${actual} to match ${expected}`)
		},
		toMatchObject(expected) {
			check(
				matchObject(actual, expected),
				`expected ${JSON.stringify(actual)} to match object ${JSON.stringify(expected)}`
			)
		},
		toThrow(expected) {
			let threw = false
			let error
			try {
				actual()
			} catch (caught) {
				threw = true
				error = caught
			}
			if (!threw) {
				check(false, 'expected function to throw')
				return
			}
			if (expected === undefined) {
				check(true, 'threw')
				return
			}
			const text = error instanceof Error ? error.message : String(error)
			const ok =
				expected instanceof RegExp
					? expected.test(text) || expected.test(String(error))
					: text.includes(String(expected))
			check(ok, `expected throw ${text} to match ${expected}`)
		},
		toHaveBeenCalled() {
			check(callsOf(actual).length > 0, 'expected function to have been called')
		},
		toHaveBeenCalledOnce() {
			check(callsOf(actual).length === 1, `expected one call, got ${callsOf(actual).length}`)
		},
		toHaveBeenCalledTimes(times) {
			check(callsOf(actual).length === times, `expected ${times} calls, got ${callsOf(actual).length}`)
		},
		toHaveBeenCalledWith(...args) {
			check(
				callsOf(actual).some(call => deepEqual(call, args)),
				`expected a call with ${JSON.stringify(args)}`
			)
		},
		get resolves() {
			return promiseMatchers(actual, message, negate, 'resolve')
		},
		get rejects() {
			return promiseMatchers(actual, message, negate, 'reject')
		},
		get not() {
			return assertion(actual, message, !negate)
		}
	}
	return matchers
}

function promiseMatchers(promise, message, negate, kind) {
	const settle = async () => {
		try {
			const value = await promise
			if (kind === 'reject') fail(message ?? 'expected promise to reject')
			return value
		} catch (error) {
			if (kind === 'resolve') fail(message ?? `expected promise to resolve: ${error}`)
			return error
		}
	}
	return {
		toBe: async expected => assertion(await settle(), message, negate).toBe(expected),
		toEqual: async expected => assertion(await settle(), message, negate).toEqual(expected),
		toBeNull: async () => assertion(await settle(), message, negate).toBeNull(),
		toThrow: async expected => assertion(await settle(), message, negate).toThrow(expected)
	}
}

function expect(actual, message) {
	return assertion(actual, message, false)
}

expect.any = ctor => ({
	asymmetricMatch(actual) {
		if (ctor === Number) return typeof actual === 'number' && !Number.isNaN(actual)
		if (ctor === String) return typeof actual === 'string'
		if (ctor === Boolean) return typeof actual === 'boolean'
		if (ctor === BigInt) return typeof actual === 'bigint'
		if (ctor === Symbol) return typeof actual === 'symbol'
		return actual instanceof ctor
	}
})

expect.objectContaining = subset => ({
	asymmetricMatch(actual) {
		return matchObject(actual, subset)
	}
})

function fn(impl) {
	let current = impl ?? (() => undefined)
	const wrapped = mock.fn((...args) => current(...args))
	wrapped.mockReturnValue = value => {
		current = () => value
		return wrapped
	}
	wrapped.mockResolvedValue = value => {
		current = () => Promise.resolve(value)
		return wrapped
	}
	wrapped.mockRejectedValue = error => {
		current = () => Promise.reject(error)
		return wrapped
	}
	wrapped.mockImplementation = next => {
		current = next
		return wrapped
	}
	return wrapped
}

function enableTimers() {
	mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'] })
	timersOn = true
}

const stubbedGlobals = new Map()

const vi = {
	fn,
	mocked: item => item,
	spyOn(obj, method) {
		const original = obj[method]
		const spy = fn((...args) => original.apply(obj, args))
		obj[method] = spy
		const restore = () => {
			obj[method] = original
		}
		restores.push(restore)
		spy.mockRestore = restore
		return spy
	},
	mock(id) {
		throw new Error(`node --test shim cannot hoist vi.mock(${JSON.stringify(id)})`)
	},
	stubGlobal(name, value) {
		if (!stubbedGlobals.has(name)) stubbedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, enumerable: true, value })
	},
	unstubAllGlobals() {
		for (const [name, descriptor] of stubbedGlobals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor)
			else Reflect.deleteProperty(globalThis, name)
		}
		stubbedGlobals.clear()
	},
	restoreAllMocks() {
		for (const restore of restores.splice(0)) restore()
	},
	useFakeTimers() {
		enableTimers()
	},
	useRealTimers() {
		if (!timersOn) return
		mock.timers.reset()
		timersOn = false
	},
	setSystemTime(value) {
		enableTimers()
		mock.timers.setTime(value instanceof Date ? value.getTime() : value)
	},
	advanceTimersByTime(ms) {
		enableTimers()
		mock.timers.tick(ms)
	},
	runAllTimers() {
		enableTimers()
		mock.timers.runAll()
	},
	getTimerCount() {
		throw new Error('node:test mock.timers has no timer census')
	}
}

export { expect, vi }
