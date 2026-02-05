const ALGORITHM = 'AES-GCM'

async function deriveKey(secret: string): Promise<CryptoKey> {
	const encoder = new TextEncoder()
	const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey'])

	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: encoder.encode('macromaxxing-salt'),
			iterations: 100000,
			hash: 'SHA-256'
		},
		keyMaterial,
		{ name: ALGORITHM, length: 256 },
		false,
		['encrypt', 'decrypt']
	)
}

export async function encrypt(plaintext: string, secret: string): Promise<{ ciphertext: string; iv: string }> {
	const key = await deriveKey(secret)
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const encoder = new TextEncoder()

	const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoder.encode(plaintext))

	return {
		ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
		iv: btoa(String.fromCharCode(...iv))
	}
}

export async function decrypt(ciphertext: string, iv: string, secret: string): Promise<string> {
	const key = await deriveKey(secret)

	const encryptedBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
	const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0))

	const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv: ivBytes }, key, encryptedBytes)

	return new TextDecoder().decode(decrypted)
}
