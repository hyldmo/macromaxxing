const STORAGE_KEY = 'macromaxxing-user-id'

export function getUserId(): string {
	let id = localStorage.getItem(STORAGE_KEY)
	if (!id) {
		id = crypto.randomUUID()
		localStorage.setItem(STORAGE_KEY, id)
	}
	return id
}
