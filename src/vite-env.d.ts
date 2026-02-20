/** biome-ignore-all lint/correctness/noUnusedVariables: TypeScript declarations */
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	readonly VITE_REPO_URL: string
	readonly VITE_CLERK_PUBLISHABLE_KEY: string
	readonly VITE_R2_BASE_URL: string
}
