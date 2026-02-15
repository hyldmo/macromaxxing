import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'
import { del, get, set } from 'idb-keyval'

const IDB_KEY = 'macromaxxing-query-cache'

export function createIDBPersister(): Persister {
	return {
		persistClient: async (client: PersistedClient) => {
			await set(IDB_KEY, client)
		},
		restoreClient: async () => {
			return await get<PersistedClient>(IDB_KEY)
		},
		removeClient: async () => {
			await del(IDB_KEY)
		}
	}
}
