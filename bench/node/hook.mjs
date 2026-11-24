import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '../..')
const extensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']

async function resolveWithExtensions(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context)
	} catch (error) {
		const targets = []
		if (specifier.startsWith('file:')) {
			const file = fileURLToPath(specifier)
			for (const ext of extensions) targets.push(pathToFileURL(file + ext).href)
			for (const ext of extensions) targets.push(pathToFileURL(path.join(file, `index${ext}`)).href)
		} else if (specifier.startsWith('.') || specifier.startsWith('/')) {
			for (const ext of extensions) targets.push(specifier + ext)
			for (const ext of extensions) targets.push(`${specifier}/index${ext}`)
		}
		let last = error
		for (const target of targets) {
			try {
				return await nextResolve(target, context)
			} catch (next) {
				last = next
			}
		}
		throw last
	}
}

export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'vitest') {
		return {
			url: pathToFileURL(path.join(import.meta.dirname, 'vitest-shim.mjs')).href,
			shortCircuit: true,
			format: 'module'
		}
	}
	if (specifier.startsWith('~/')) {
		const mapped = pathToFileURL(path.join(root, 'src', specifier.slice(2))).href
		return resolveWithExtensions(mapped, context, nextResolve)
	}
	return resolveWithExtensions(specifier, context, nextResolve)
}
