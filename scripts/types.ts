/** Converts a camelCase string to snake_case */
type CamelToSnake<S extends string> = S extends `${infer T}${infer U}`
	? U extends Uncapitalize<U>
		? `${Lowercase<T>}${CamelToSnake<U>}`
		: `${Lowercase<T>}_${CamelToSnake<U>}`
	: S

/** Maps Drizzle's camelCase types to the snake_case keys returned by D1 */
export type D1Row<T> = {
	[K in keyof T as K extends string ? CamelToSnake<K> : K]: T[K]
}
